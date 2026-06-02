# OpenTofu + provider pinning for the BattleFuel Hetzner Cloud deployment.
# Run with the OpenTofu CLI:  tofu init / tofu plan / tofu apply
terraform {
  required_version = ">= 1.6"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.49"
    }
  }

  # State backend: local by default (single-operator MVP). The state file contains secrets
  # (the hcloud token is marked sensitive, but resource attributes may include sensitive
  # data) — keep terraform.tfstate out of git (see infra/.gitignore) and back it up.
  # For a remote backend later, uncomment and configure (e.g. an S3-compatible bucket):
  #
  # backend "s3" {
  #   bucket                      = "battlefuel-tfstate"
  #   key                         = "hetzner/terraform.tfstate"
  #   region                      = "eu-central-1"
  #   endpoints                   = { s3 = "https://<your-s3-endpoint>" }
  #   skip_credentials_validation = true
  #   skip_region_validation      = true
  #   skip_requesting_account_id  = true
  # }
}

provider "hcloud" {
  token = var.hcloud_token
}
