output "alb_dns_name" {
  value       = aws_lb.this.dns_name
  description = "Point the API hostname (CNAME) here"
}

output "docdb_endpoint" {
  value = aws_docdb_cluster.this.endpoint
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "ecs_cluster" {
  value = aws_ecs_cluster.this.name
}
