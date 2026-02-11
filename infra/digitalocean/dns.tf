# =============================================================================
# DNS — Domain + A Records
# =============================================================================
# NOTE: Your domain's nameservers must point to DigitalOcean:
#   ns1.digitalocean.com
#   ns2.digitalocean.com
#   ns3.digitalocean.com

resource "digitalocean_domain" "main" {
  name = var.domain_name
}

resource "digitalocean_record" "root" {
  domain = digitalocean_domain.main.id
  type   = "A"
  name   = "@"
  value  = digitalocean_droplet.app.ipv4_address
  ttl    = 300
}

resource "digitalocean_record" "www" {
  domain = digitalocean_domain.main.id
  type   = "A"
  name   = "www"
  value  = digitalocean_droplet.app.ipv4_address
  ttl    = 300
}
