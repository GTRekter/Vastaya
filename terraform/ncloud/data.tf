data "ncloud_nks_server_images" "image" {
  hypervisor_code = "KVM"
  filter {
    name   = "label"
    values = ["ubuntu-22.04"]
    regex  = true
  }
}

data "ncloud_nks_server_products" "product" {
  software_code = data.ncloud_nks_server_images.image.images[0].value
  zone          = "KR-1"
  filter {
    name   = "product_type"
    values = ["STAND"]
  }
  filter {
    name   = "cpu_count"
    values = ["2"]
  }
  filter {
    name   = "memory_size"
    values = ["8GB"]
  }
}