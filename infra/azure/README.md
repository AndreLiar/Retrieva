# Azure Infrastructure for RAG Backend

This Terraform configuration provisions Azure resources for the RAG backend, including Azure OpenAI for LLM and embedding services.

## Prerequisites

1. **Azure CLI** installed and authenticated:
   ```bash
   az login
   az account show  # Verify you're logged in
   ```

2. **Terraform** (>= 1.5.0) installed:
   ```bash
   terraform version
   ```

3. **Azure Subscription** with permissions to create:
   - Resource Groups
   - Cognitive Services (Azure OpenAI)
   - Consumption Budgets

## Quick Start

1. **Copy the example variables file**:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

2. **Edit `terraform.tfvars`** with your values:
   ```hcl
   subscription_id     = "your-azure-subscription-id"
   budget_alert_email  = "your-email@example.com"
   ```

3. **Initialize Terraform**:
   ```bash
   terraform init
   ```

4. **Preview changes**:
   ```bash
   terraform plan
   ```

5. **Apply the configuration**:
   ```bash
   terraform apply
   ```

6. **Get the backend configuration**:
   ```bash
   # Get all outputs
   terraform output

   # Get the environment variables to add to your backend .env
   terraform output -raw backend_env_config

   # Get just the API key retrieval command
   terraform output -raw api_key_command
   ```

7. **Retrieve the API key** (not stored in Terraform state for security):
   ```bash
   # Run the command from terraform output
   az cognitiveservices account keys list \
     --name $(terraform output -raw openai_account_name) \
     --resource-group $(terraform output -raw resource_group_name) \
     --query "key1" -o tsv
   ```

## Resources Created

| Resource | Description |
|----------|-------------|
| Resource Group | Container for all resources |
| Azure OpenAI Account | Cognitive Services account for OpenAI models |
| Embedding Deployment | `text-embedding-3-small` for vector embeddings |
| LLM Deployment | `gpt-35-turbo` for language model |
| Budget Alert | Monthly spending alerts at 50%, 80%, 100% |

## Cost Estimation

With default settings (~120K TPM capacity):
- **Embeddings**: ~$2/month (text-embedding-3-small)
- **LLM**: ~$9/month (GPT-3.5 Turbo)
- **Total**: ~$11-15/month (depends on usage)

Budget alerts notify you at 50%, 80%, and 100% of the $20 monthly budget.

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `location` | `westeurope` | Azure region |
| `openai_sku` | `S0` | Azure OpenAI SKU |
| `budget_amount` | `20` | Monthly budget (USD) |
| `embedding_model.capacity` | `120` | TPM in thousands |
| `llm_model.capacity` | `120` | TPM in thousands |

## Backend Integration

After deploying, update your backend `.env` file:

```env
# Azure OpenAI Configuration
LLM_PROVIDER=azure_openai
EMBEDDING_PROVIDER=azure

AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_ENDPOINT=<endpoint-from-terraform-output>
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-35-turbo
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

Then recreate your Qdrant collection with the correct dimensions:
```bash
# Delete old collection (1024 dimensions from local embeddings)
curl -X DELETE http://localhost:6333/collections/langchain-rag

# Create new collection with 1536 dimensions for OpenAI embeddings
curl -X PUT http://localhost:6333/collections/langchain-rag \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 1536, "distance": "Cosine"}}'
```

## Cleanup

To destroy all resources:
```bash
terraform destroy
```

## Troubleshooting

### Model not available in region
Azure OpenAI model availability varies by region. Check [Azure OpenAI model availability](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models#model-summary-table-and-region-availability) if you encounter deployment errors.

### Quota exceeded
Request quota increases through Azure Portal:
1. Go to Azure OpenAI resource
2. Navigate to "Quotas"
3. Request increase for the specific model

### Budget alerts not firing
Budget alerts can take up to 24 hours to activate after creation. They evaluate daily.
