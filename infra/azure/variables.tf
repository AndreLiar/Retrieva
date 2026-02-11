# =============================================================================
# Azure Subscription
# =============================================================================

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

# =============================================================================
# Resource Configuration
# =============================================================================

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "rag-backend"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "westeurope"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "RAG Backend"
    ManagedBy   = "Terraform"
    Environment = "Development"
  }
}

# =============================================================================
# Azure OpenAI Configuration
# =============================================================================

variable "openai_sku" {
  description = "SKU for Azure OpenAI service"
  type        = string
  default     = "S0"
}

variable "embedding_model" {
  description = "Embedding model deployment configuration"
  type = object({
    name     = string
    model    = string
    version  = string
    capacity = number
  })
  default = {
    name     = "text-embedding-3-small"
    model    = "text-embedding-3-small"
    version  = "1"
    capacity = 120 # Tokens per minute (in thousands)
  }
}

variable "llm_model" {
  description = "LLM model deployment configuration"
  type = object({
    name     = string
    model    = string
    version  = string
    capacity = number
  })
  default = {
    name     = "gpt-4o-mini"
    model    = "gpt-4o-mini"
    version  = "2024-07-18"
    capacity = 120 # Tokens per minute (in thousands)
  }
}

# =============================================================================
# Budget Alert Configuration
# =============================================================================

variable "budget_amount" {
  description = "Monthly budget amount in USD"
  type        = number
  default     = 20
}

variable "budget_alert_email" {
  description = "Email address for budget alerts"
  type        = string
}

variable "budget_thresholds" {
  description = "Budget alert thresholds (percentage)"
  type        = list(number)
  default     = [50, 80, 100]
}
