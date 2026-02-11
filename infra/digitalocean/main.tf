# =============================================================================
# DigitalOcean Infrastructure — Single Droplet for Retrieva
# =============================================================================

# SSH Key
resource "digitalocean_ssh_key" "deploy" {
  name       = "${var.project_name}-deploy-key"
  public_key = file(var.ssh_public_key_path)
}

# Droplet
resource "digitalocean_droplet" "app" {
  name     = "${var.project_name}-app"
  image    = "ubuntu-22-04-x64"
  size     = var.droplet_size
  region   = var.region
  ssh_keys = [digitalocean_ssh_key.deploy.fingerprint]

  user_data = file("${path.module}/user-data.sh")

  tags = [var.project_name, "production"]
}

# Firewall
resource "digitalocean_firewall" "app" {
  name        = "${var.project_name}-firewall"
  droplet_ids = [digitalocean_droplet.app.id]

  # SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP (for Certbot challenge + redirect)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # All outbound
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# Project (groups resources in DO dashboard)
resource "digitalocean_project" "app" {
  name        = var.project_name
  description = "Retrieva RAG Platform"
  purpose     = "Web Application"
  environment = "Production"
  resources   = [digitalocean_droplet.app.urn]
}
