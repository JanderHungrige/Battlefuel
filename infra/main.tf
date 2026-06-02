# Hetzner Cloud infrastructure for BattleFuel: SSH key, firewall, block volume, server
# (with cloud-init bootstrap), and a stable floating IP.

resource "hcloud_ssh_key" "admin" {
  name       = "${var.name}-admin"
  public_key = var.ssh_public_key
}

# Only SSH (locked to admin CIDR) + HTTP/HTTPS (public, for the Caddy edge + ACME).
resource "hcloud_firewall" "edge" {
  name = "${var.name}-fw"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = [var.ssh_admin_cidr]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# Block volume for Postgres data + backups (survives server rebuilds).
resource "hcloud_volume" "data" {
  name     = "${var.name}-data"
  size     = var.volume_size
  location = var.location
  format   = "ext4"
}

resource "hcloud_server" "app" {
  name        = var.name
  server_type = var.server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.admin.id]

  labels = {
    app    = var.name
    domain = var.domain
  }

  # cloud-init: install Docker + compose plugin, mount the volume at /mnt/battlefuel-data,
  # and create the data/backup/deploy dirs the compose stack expects.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    volume_device = hcloud_volume.data.linux_device
  })
}

# Attach the volume; mounting is handled by cloud-init (automount disabled so we control
# the mount point and don't race the data dir creation).
resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.app.id
  automount = false
}

# Stable public IP, independent of the server lifecycle.
resource "hcloud_floating_ip" "app" {
  type          = "ipv4"
  home_location = var.location
  description   = "${var.name} stable ingress"
}

resource "hcloud_floating_ip_assignment" "app" {
  floating_ip_id = hcloud_floating_ip.app.id
  server_id      = hcloud_server.app.id
}

resource "hcloud_firewall_attachment" "edge" {
  firewall_id = hcloud_firewall.edge.id
  server_ids  = [hcloud_server.app.id]
}
