# Infrastructure

Production runs on **DigitalOcean** (single droplet in fra1, `164.90.211.155`,
domain `retrieva.online`). Infrastructure-as-code lives in
[`./digitalocean/`](./digitalocean/).

## Layout

```
infra/
├── digitalocean/   Terraform — droplet, firewall, DNS, user-data bootstrap
└── README.md       (this file)
```

## Common operations

```bash
cd infra/digitalocean
terraform init
terraform plan
terraform apply
```

`terraform.tfvars` is gitignored (contains DO API token + SSH key fingerprint).
Use `terraform.tfvars.example` as a starting template.

## Historical note

Azure (Azure OpenAI Cognitive Services) Terraform was removed once the runtime
migrated entirely to Ollama Cloud (chat) + self-hosted Ollama (embeddings).
If you need that history, see git log before the removal commit.
