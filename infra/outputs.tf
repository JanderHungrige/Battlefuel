output "server_ipv4" {
  description = "The server's own public IPv4 (use until DNS points at the floating IP)."
  value       = hcloud_server.app.ipv4_address
}

output "floating_ipv4" {
  description = "Stable floating IPv4 — point your domain's A record here."
  value       = hcloud_floating_ip.app.ip_address
}

output "volume_device" {
  description = "Linux device path of the attached block volume (mounted at /mnt/battlefuel-data)."
  value       = hcloud_volume.data.linux_device
}

output "ssh_command" {
  description = "Convenience SSH command to reach the host."
  value       = "ssh root@${hcloud_server.app.ipv4_address}"
}
