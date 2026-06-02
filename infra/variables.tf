variable "hcloud_token" {
  description = "Hetzner Cloud API token (project-scoped, read/write). Keep in a gitignored *.auto.tfvars."
  type        = string
  sensitive   = true
}

variable "name" {
  description = "Name prefix for all created resources."
  type        = string
  default     = "battlefuel"
}

variable "location" {
  description = "Hetzner location (nbg1/fsn1/hel1 = EU, ash/hil = US). Volume + server must share it."
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server type. amd64 (cpx*) is the safe default for ortools/PostGIS wheels; cpx31 = 4 vCPU / 8 GB."
  type        = string
  default     = "cpx31"
}

variable "image" {
  description = "Base OS image."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_key" {
  description = "SSH public key material (the contents of e.g. ~/.ssh/id_ed25519.pub) for host access."
  type        = string
}

variable "ssh_admin_cidr" {
  description = "CIDR allowed to reach SSH (22). Lock this to your IP; 0.0.0.0/0 is open to the world."
  type        = string
  default     = "0.0.0.0/0"
}

variable "volume_size" {
  description = "Block volume size in GB for Postgres data + backups (min 10)."
  type        = number
  default     = 20
}

variable "domain" {
  description = "Public domain the stack is served on (informational label; DNS is managed separately)."
  type        = string
  default     = ""
}
