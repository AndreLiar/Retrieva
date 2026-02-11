variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "retrieva"
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "fra1" # Frankfurt — close to Azure West Europe
}

variable "droplet_size" {
  description = "Droplet size slug"
  type        = string
  default     = "s-2vcpu-4gb" # 2 vCPU, 4 GB RAM, ~$24/mo
}

variable "domain_name" {
  description = "Your domain name"
  type        = string
  default     = "devandre.sbs"
}

variable "ssh_public_key_path" {
  description = "Path to your SSH public key"
  type        = string
  default     = "~/.ssh/retrieva_deploy.pub"
}
