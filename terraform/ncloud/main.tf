terraform {
  required_providers {
    ncloud = {
      source = "NaverCloudPlatform/ncloud"
    }
  }
  required_version = ">= 0.13"
}

provider "ncloud" {
  access_key = var.access_key
  secret_key = var.secret_key
  region     = var.region
  support_vpc = true
}

module "vpc" {
  source          = "terraform-navercloudplatform-modules/vpc-vpc/ncloud"
  version         = "1.0.0"
  name            = "example-vpc"
  ipv4_cidr_block = "10.0.0.0/16"
}

module "subnet" {
  source         = "terraform-navercloudplatform-modules/subnet-vpc/ncloud"
  version        = "1.0.1"
  name           = "example-subnet"
  vpc_no         = module.vpc.id
  subnet         = "10.0.1.0/24"
  zone           = "KR-1"
  subnet_type    = "PRIVATE"
  usage_type     = "GEN"
  network_acl_no = module.vpc.default_network_acl_no
}

module "subnet_lb" {
  source         = "terraform-navercloudplatform-modules/subnet-vpc/ncloud"
  version        = "1.0.1"
  name           = "example-subnet"
  vpc_no         = module.vpc.id
  subnet         = "10.0.100.0/24"
  zone           = "KR-1"
  subnet_type    = "PRIVATE"
  usage_type     = "LOADB"
  network_acl_no = module.vpc.default_network_acl_no
}

module "login_key" {
  source   = "terraform-navercloudplatform-modules/login-key/ncloud"
  version  = "1.0.1"
  key_name = "example-key"
}

module "cluster" {
  source               = "terraform-navercloudplatform-modules/kubernetes-cluster-vpc/ncloud"
  version              = "v1.0.1"
  name                 = "example-cluster"
  vpc_no               = module.vpc.id
  subnet_no_list       = [module.subnet.id]
  lb_private_subnet_no = module.subnet_lb.id
  cluster_type         = "SVR.VNKS.STAND.C002.M008.NET.SSD.B050.G002"
  login_key_name       = module.login_key.name
  zone                 = "KR-1"
}

module "node_pool" {
  source           = "terraform-navercloudplatform-modules/kubernetes-node-pool-vpc/ncloud"
  version          = "1.0.0"
  cluster_uuid     = module.cluster.uuid
  node_pool_name   = "example-node-pool"
  node_count       = 2
  software_code    = data.ncloud_nks_server_images.image.images[0].value
  server_spec_code = data.ncloud_nks_server_products.product.products.0.value
  storage_size     = 200
  autoscale = {
    enabled = false
    min     = 2
    max     = 2
  }
}