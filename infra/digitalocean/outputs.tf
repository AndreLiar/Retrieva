output "droplet_ip" {
  description = "Droplet public IPv4 address"
  value       = digitalocean_droplet.app.ipv4_address
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh deploy@${digitalocean_droplet.app.ipv4_address}"
}

output "droplet_id" {
  description = "Droplet ID"
  value       = digitalocean_droplet.app.id
}

output "domain" {
  description = "Domain name"
  value       = var.domain_name
}
