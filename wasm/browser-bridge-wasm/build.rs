use std::io::Result;

fn main() -> Result<()> {
    let proto_path = "proto/messages.proto";
    prost_build::Config::new()
        .file_descriptor_set_path(std::env::var("OUT_DIR").unwrap() + "/file_descriptor_set.bin")
        .compile_protos(&[proto_path], &["proto/"])?;
    Ok(())
}
