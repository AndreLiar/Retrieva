"""
RAGAS Evaluation Microservice

Provides RAG quality evaluation using the RAGAS library (v0.2+).
Metrics: Faithfulness, Answer Relevancy, Context Precision, Context Recall

Usage:
    uvicorn app:app --host 0.0.0.0 --port 8001 --reload
"""

import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# RAGAS imports (v0.2.x API)
from ragas import EvaluationDataset, SingleTurnSample, evaluate
from ragas.metrics import (
    Faithfulness,
    ResponseRelevancy,
    LLMContextPrecisionWithoutReference,
    LLMContextRecall,
)

# LangChain imports for LLM
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama

import structlog

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
logger = structlog.get_logger()

# Initialize FastAPI app
app = FastAPI(
    title="RAGAS Evaluation Service",
    description="RAG quality evaluation microservice using RAGAS metrics",
    version="2.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3007", "http://backend:3007"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["Content-Type", "Authorization"],
)

# ============================================================================
# Configuration
# ============================================================================

LLM_PROVIDER = os.getenv("RAGAS_LLM_PROVIDER", "ollama")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def get_llm():
    """Get LLM instance based on configuration."""
    if LLM_PROVIDER == "openai" and OPENAI_API_KEY:
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=OPENAI_API_KEY,
        )
    else:
        return ChatOllama(
            model=OLLAMA_MODEL,
            base_url=OLLAMA_BASE_URL,
            temperature=0,
        )


# ============================================================================
# Pydantic Models
# ============================================================================

class EvaluationSample(BaseModel):
    """Single evaluation sample."""
    question: str = Field(..., description="The user's question")
    answer: str = Field(..., description="The generated answer")
    contexts: List[str] = Field(..., description="List of retrieved context passages")
    ground_truth: Optional[str] = Field(None, description="Expected answer (for recall)")


class SingleEvaluationRequest(BaseModel):
    """Request for single evaluation."""
    question: str
    answer: str
    contexts: List[str]
    ground_truth: Optional[str] = None
    metrics: Optional[List[str]] = Field(
        default=["faithfulness", "answer_relevancy", "context_precision"],
        description="Metrics to evaluate"
    )


class BatchEvaluationRequest(BaseModel):
    """Request for batch evaluation."""
    samples: List[EvaluationSample]
    metrics: Optional[List[str]] = Field(
        default=["faithfulness", "answer_relevancy", "context_precision"],
        description="Metrics to evaluate"
    )


class EvaluationResult(BaseModel):
    """Result of evaluation."""
    metrics: dict
    overall_score: Optional[float]
    evaluation_time_ms: int
    timestamp: str


class BatchEvaluationResult(BaseModel):
    """Result of batch evaluation."""
    results: List[dict]
    aggregate: dict
    total_samples: int
    evaluation_time_ms: int
    timestamp: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    llm_provider: str
    llm_model: str
    available_metrics: List[str]


# ============================================================================
# Metrics (RAGAS v0.2.x)
# ============================================================================

AVAILABLE_METRICS = {
    "faithfulness": Faithfulness,
    "answer_relevancy": ResponseRelevancy,
    "context_precision": LLMContextPrecisionWithoutReference,
    "context_recall": LLMContextRecall,
}


def get_metrics(metric_names: List[str], llm):
    """Get RAGAS metric instances."""
    metrics = []
    for name in metric_names:
        if name in AVAILABLE_METRICS:
            metric_class = AVAILABLE_METRICS[name]
            metric = metric_class(llm=llm)
            metrics.append(metric)
        else:
            logger.warning(f"Unknown metric: {name}")
    return metrics


# Thread pool for running blocking RAGAS evaluations
executor = ThreadPoolExecutor(max_workers=4)


import math

def _clean_float(value):
    """Clean float values - replace NaN/Inf with None."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
    return value


def _clean_dict(d):
    """Clean all float values in a dictionary."""
    return {k: _clean_float(v) if isinstance(v, (int, float)) else v for k, v in d.items()}


def _run_evaluation_sync(samples: List[dict], metric_names: List[str]) -> dict:
    """Run RAGAS evaluation synchronously (for thread pool)."""
    start_time = datetime.now()

    llm = get_llm()

    # Create SingleTurnSample objects
    eval_samples = []
    for s in samples:
        sample = SingleTurnSample(
            user_input=s["question"],
            response=s["answer"],
            retrieved_contexts=s["contexts"],
        )
        if s.get("ground_truth"):
            sample.reference = s["ground_truth"]
        eval_samples.append(sample)

    # Create evaluation dataset
    eval_dataset = EvaluationDataset(samples=eval_samples)

    # Get metrics
    metrics = get_metrics(metric_names, llm)

    if not metrics:
        raise ValueError("No valid metrics specified")

    logger.info("Starting RAGAS evaluation", sample_count=len(samples), metrics=metric_names)

    # Run evaluation (blocking)
    result = evaluate(dataset=eval_dataset, metrics=metrics)

    evaluation_time = int((datetime.now() - start_time).total_seconds() * 1000)

    logger.info(
        "RAGAS evaluation completed",
        evaluation_time_ms=evaluation_time,
        sample_count=len(samples),
    )

    # Convert results to dict format and clean NaN values
    result_df = result.to_pandas()
    scores = [_clean_dict(record) for record in result_df.to_dict('records')]

    # Calculate aggregate scores (handle NaN)
    aggregate = {}
    for metric_name in metric_names:
        if metric_name in result_df.columns:
            mean_val = result_df[metric_name].mean()
            aggregate[metric_name] = _clean_float(float(mean_val))

    return {
        "scores": scores,
        "aggregate": aggregate,
        "evaluation_time_ms": evaluation_time,
    }


async def run_evaluation(samples: List[dict], metric_names: List[str]) -> dict:
    """Run RAGAS evaluation on samples (async wrapper)."""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            _run_evaluation_sync,
            samples,
            metric_names,
        )
        return result
    except Exception as e:
        logger.error("RAGAS evaluation failed", error=str(e))
        raise


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        llm_provider=LLM_PROVIDER,
        llm_model=OLLAMA_MODEL if LLM_PROVIDER == "ollama" else "gpt-4o-mini",
        available_metrics=list(AVAILABLE_METRICS.keys()),
    )


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": "RAGAS Evaluation Microservice",
        "version": "2.0.0",
        "ragas_version": "0.2.x",
        "endpoints": {
            "health": "GET /health",
            "evaluate_single": "POST /evaluate",
            "evaluate_batch": "POST /evaluate/batch",
            "metrics_info": "GET /metrics",
        },
    }


@app.get("/metrics")
async def get_metrics_info():
    """Get information about available metrics."""
    return {
        "available_metrics": {
            "faithfulness": {
                "description": "Measures if the answer is grounded in the retrieved context",
                "range": "0.0 - 1.0",
                "higher_is_better": True,
            },
            "answer_relevancy": {
                "description": "Measures if the answer is relevant to the question",
                "range": "0.0 - 1.0",
                "higher_is_better": True,
            },
            "context_precision": {
                "description": "Measures if retrieved contexts are relevant to the question",
                "range": "0.0 - 1.0",
                "higher_is_better": True,
            },
            "context_recall": {
                "description": "Measures if context contains info needed to answer (requires ground_truth)",
                "range": "0.0 - 1.0",
                "higher_is_better": True,
            },
        },
        "default_metrics": ["faithfulness", "answer_relevancy", "context_precision"],
    }


@app.post("/evaluate", response_model=EvaluationResult)
async def evaluate_single(request: SingleEvaluationRequest):
    """Evaluate a single RAG response."""
    try:
        sample = {
            "question": request.question,
            "answer": request.answer,
            "contexts": request.contexts,
            "ground_truth": request.ground_truth,
        }

        result = await run_evaluation([sample], request.metrics)

        scores = result["scores"][0] if result["scores"] else {}
        valid_scores = [v for k, v in scores.items() if k in request.metrics and isinstance(v, (int, float))]
        overall = sum(valid_scores) / len(valid_scores) if valid_scores else None

        return EvaluationResult(
            metrics=scores,
            overall_score=overall,
            evaluation_time_ms=result["evaluation_time_ms"],
            timestamp=datetime.now().isoformat(),
        )

    except Exception as e:
        logger.error("Single evaluation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evaluate/batch", response_model=BatchEvaluationResult)
async def evaluate_batch(request: BatchEvaluationRequest):
    """Evaluate multiple RAG responses in batch."""
    if len(request.samples) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 samples per batch")

    if len(request.samples) == 0:
        raise HTTPException(status_code=400, detail="At least one sample required")

    try:
        samples = [
            {
                "question": s.question,
                "answer": s.answer,
                "contexts": s.contexts,
                "ground_truth": s.ground_truth,
            }
            for s in request.samples
        ]

        result = await run_evaluation(samples, request.metrics)

        aggregate = result["aggregate"]
        valid_values = [v for v in aggregate.values() if v is not None]
        aggregate["overall"] = sum(valid_values) / len(valid_values) if valid_values else None

        return BatchEvaluationResult(
            results=result["scores"],
            aggregate=aggregate,
            total_samples=len(request.samples),
            evaluation_time_ms=result["evaluation_time_ms"],
            timestamp=datetime.now().isoformat(),
        )

    except Exception as e:
        logger.error("Batch evaluation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("RAGAS_SERVICE_PORT", 8001))

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
