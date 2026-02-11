#!/bin/bash
set -euo pipefail

# =============================================================================
# Cloud-init — Bootstrap DigitalOcean Droplet for Retrieva
# =============================================================================
# This runs ONCE on first boot. It installs:
#   - Docker + Docker Compose
#   - Nginx + Certbot
#   - age + SOPS (for secret decryption)
#   - Creates 'deploy' user
#   - Configures UFW firewall

export DEBIAN_FRONTEND=noninteractive

# --- System Update ---
apt-get update && apt-get upgrade -y

# --- Create deploy user ---
useradd -m -s /bin/bash -G sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy

# --- Install Docker ---
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable docker
systemctl start docker

# --- Install Docker Compose plugin ---
apt-get install -y docker-compose-plugin

# --- Install Nginx ---
apt-get install -y nginx
systemctl enable nginx

# --- Install Certbot ---
apt-get install -y certbot python3-certbot-nginx

# --- Install age (for SOPS decryption) ---
AGE_VERSION="v1.2.0"
curl -L -o /tmp/age.tar.gz "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-amd64.tar.gz"
tar -xzf /tmp/age.tar.gz -C /tmp
mv /tmp/age/age /usr/local/bin/age
mv /tmp/age/age-keygen /usr/local/bin/age-keygen
chmod +x /usr/local/bin/age /usr/local/bin/age-keygen
rm -rf /tmp/age*

# --- Install SOPS ---
SOPS_VERSION="v3.9.0"
curl -L -o /usr/local/bin/sops "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.amd64"
chmod +x /usr/local/bin/sops

# --- Install Git ---
apt-get install -y git

# --- Create app directory ---
mkdir -p /opt/rag
chown deploy:deploy /opt/rag

# --- Configure UFW ---
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# --- Configure Docker log rotation ---
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# --- Disable root SSH login ---
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart sshd

# --- Enable unattended security updates ---
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo "=== Cloud-init complete ==="
