variable "project" {
  type    = string
  default = "chatverse"
}

variable "environment" {
  type        = string
  default     = "staging"
  description = "staging or prod; prod enables multi-AZ data stores and longer backups"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "api_image" {
  type        = string
  default     = "ghcr.io/satvikpraveen/chatverse-api:latest"
  description = "Image published by .github/workflows/release.yml"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "api_max_count" {
  type    = number
  default = 10
}

variable "cors_origins" {
  type    = list(string)
  default = ["https://chat.example.com"]
}

variable "docdb_username" {
  type    = string
  default = "chatverse"
}

variable "docdb_password" {
  type      = string
  sensitive = true
}

variable "docdb_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "redis_auth_token" {
  type      = string
  sensitive = true
}

variable "jwt_access_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.jwt_access_secret) >= 32
    error_message = "jwt_access_secret must be at least 32 characters."
  }
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
  validation {
    condition     = length(var.jwt_refresh_secret) >= 32
    error_message = "jwt_refresh_secret must be at least 32 characters."
  }
}
