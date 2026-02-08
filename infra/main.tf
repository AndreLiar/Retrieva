# =============================================================================
# Azure RAG Backend Infrastructure
# =============================================================================
# This Terraform configuration provisions:
# - Resource Group
# - Azure OpenAI Service with model deployments
# - Budget alerts for cost management
# =============================================================================

# -----------------------------------------------------------------------------
# Random suffix for globally unique names
# -----------------------------------------------------------------------------
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# -----------------------------------------------------------------------------
# Resource Group
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}"
  location = var.location
  tags     = var.tags
}

# -----------------------------------------------------------------------------
# Azure OpenAI Cognitive Service
# -----------------------------------------------------------------------------
resource "azurerm_cognitive_account" "openai" {
  name                  = "oai-${var.project_name}-${random_string.suffix.result}"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "OpenAI"
  sku_name              = var.openai_sku
  custom_subdomain_name = "oai-${var.project_name}-${random_string.suffix.result}"

  tags = var.tags

  lifecycle {
    ignore_changes = [
      tags["CreatedDate"]
    ]
  }
}

# -----------------------------------------------------------------------------
# Embedding Model Deployment (text-embedding-3-small)
# -----------------------------------------------------------------------------
resource "azurerm_cognitive_deployment" "embedding" {
  name                 = var.embedding_model.name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.embedding_model.model
    version = var.embedding_model.version
  }

  scale {
    type     = "Standard"
    capacity = var.embedding_model.capacity
  }
}

# -----------------------------------------------------------------------------
# LLM Model Deployment (GPT-3.5 Turbo)
# -----------------------------------------------------------------------------
resource "azurerm_cognitive_deployment" "llm" {
  name                 = var.llm_model.name
  cognitive_account_id = azurerm_cognitive_account.openai.id

  model {
    format  = "OpenAI"
    name    = var.llm_model.model
    version = var.llm_model.version
  }

  scale {
    type     = "Standard"
    capacity = var.llm_model.capacity
  }

  depends_on = [azurerm_cognitive_deployment.embedding]
}

# -----------------------------------------------------------------------------
# Budget Alert
# -----------------------------------------------------------------------------
resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "budget-${var.project_name}-${var.environment}"
  resource_group_id = azurerm_resource_group.main.id

  amount     = var.budget_amount
  time_grain = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
    end_date   = formatdate("YYYY-MM-01'T'00:00:00Z", timeadd(timestamp(), "8760h")) # 1 year
  }

  dynamic "notification" {
    for_each = var.budget_thresholds
    content {
      enabled        = true
      threshold      = notification.value
      operator       = "GreaterThan"
      threshold_type = "Actual"

      contact_emails = [var.budget_alert_email]
    }
  }

  lifecycle {
    ignore_changes = [
      time_period
    ]
  }
}
