use prost::Message;
use wasm_bindgen::prelude::*;

pub mod proto {
    include!(concat!(env!("OUT_DIR"), "/browser_bridge.rs"));
}

use proto::{
    BrowserRequest, EmailData, ExtensionMessage, HotReloadMessage, KeepaliveMessage,
    NewEmailMessage, ResponseMessage, TokenMessage,
};

const TAG_BROWSER_REQUEST: u8 = 0x01;
const TAG_EXTENSION_MESSAGE: u8 = 0x02;
const TAG_TOKEN_MESSAGE: u8 = 0x03;

#[derive(serde::Deserialize)]
struct JsonBrowserRequest {
    id: String,
    action: String,
    #[serde(default)]
    payload: serde_json::Value,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
enum JsonExtensionMessage {
    #[serde(rename = "response")]
    Response {
        id: String,
        #[serde(default)]
        payload: serde_json::Value,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "hot-reload")]
    HotReload {
        #[serde(default)]
        files: Option<Vec<String>>,
    },
    #[serde(rename = "new_email")]
    NewEmail { email: JsonEmailData },
}

#[derive(serde::Deserialize)]
struct JsonEmailData {
    #[serde(default)]
    subject: Option<String>,
    #[serde(default)]
    sender: Option<String>,
    #[serde(default)]
    body_preview: Option<String>,
}

#[derive(serde::Deserialize)]
struct JsonTokenMessage {
    platform: String,
    #[serde(rename = "tokenType")]
    token_type: String,
    token: String,
    #[serde(default)]
    url: Option<String>,
    timestamp: u64,
}

fn json_to_bytes(val: &serde_json::Value) -> Vec<u8> {
    val.to_string().into_bytes()
}

fn bytes_to_json(data: &[u8]) -> serde_json::Value {
    serde_json::from_slice(data).unwrap_or(serde_json::Value::Null)
}

#[wasm_bindgen]
pub fn serialize_message(msg_type: &str, msg_json: &str) -> Vec<u8> {
    match msg_type {
        "BrowserRequest" => {
            let req: JsonBrowserRequest =
                serde_json::from_str(msg_json).expect("invalid JSON for BrowserRequest");
            let proto = BrowserRequest {
                id: req.id,
                action: req.action,
                payload: json_to_bytes(&req.payload),
            };
            encode_with_tag(TAG_BROWSER_REQUEST, &proto)
        }
        "ExtensionMessage" => {
            let msg: JsonExtensionMessage =
                serde_json::from_str(msg_json).expect("invalid JSON for ExtensionMessage");
            let proto = match msg {
                JsonExtensionMessage::Response { id, payload } => ExtensionMessage {
                    variant: Some(proto::extension_message::Variant::Response(
                        ResponseMessage {
                            id,
                            payload: json_to_bytes(&payload),
                        },
                    )),
                },
                JsonExtensionMessage::Ping => ExtensionMessage {
                    variant: Some(proto::extension_message::Variant::Keepalive(
                        KeepaliveMessage {},
                    )),
                },
                JsonExtensionMessage::HotReload { files } => ExtensionMessage {
                    variant: Some(proto::extension_message::Variant::HotReload(
                        HotReloadMessage {
                            files: files.unwrap_or_default(),
                        },
                    )),
                },
                JsonExtensionMessage::NewEmail { email } => ExtensionMessage {
                    variant: Some(proto::extension_message::Variant::NewEmail(
                        NewEmailMessage {
                            email: Some(EmailData {
                                subject: email.subject,
                                sender: email.sender,
                                body_preview: email.body_preview,
                            }),
                        },
                    )),
                },
            };
            encode_with_tag(TAG_EXTENSION_MESSAGE, &proto)
        }
        "TokenMessage" => {
            let tok: JsonTokenMessage =
                serde_json::from_str(msg_json).expect("invalid JSON for TokenMessage");
            let proto = TokenMessage {
                platform: tok.platform,
                token_type: tok.token_type,
                token: tok.token,
                url: tok.url,
                timestamp: tok.timestamp,
            };
            encode_with_tag(TAG_TOKEN_MESSAGE, &proto)
        }
        _ => panic!("unknown message type: {}", msg_type),
    }
}

fn encode_with_tag(tag: u8, msg: &impl prost::Message) -> Vec<u8> {
    let mut out = Vec::with_capacity(1 + msg.encoded_len());
    out.push(tag);
    msg.encode_raw(&mut out);
    out
}

#[wasm_bindgen]
pub fn deserialize_message(data: &[u8]) -> String {
    if data.is_empty() {
        return r#"{"error":"empty data"}"#.to_string();
    }
    let tag = data[0];
    let payload = &data[1..];
    match tag {
        TAG_BROWSER_REQUEST => decode_browser_request(payload),
        TAG_EXTENSION_MESSAGE => decode_extension_message(payload),
        TAG_TOKEN_MESSAGE => decode_token_message(payload),
        _ => r#"{"error":"unknown message format"}"#.to_string(),
    }
}

fn decode_browser_request(data: &[u8]) -> String {
    let req = BrowserRequest::decode(data).expect("failed to decode BrowserRequest");
    let json = serde_json::json!({
        "type": "BrowserRequest",
        "id": req.id,
        "action": req.action,
        "payload": bytes_to_json(&req.payload),
    });
    serde_json::to_string(&json).expect("JSON serialize failed")
}

fn decode_extension_message(data: &[u8]) -> String {
    let ext = ExtensionMessage::decode(data).expect("failed to decode ExtensionMessage");
    let json = match ext.variant {
        Some(proto::extension_message::Variant::Response(r)) => serde_json::json!({
            "type": "response",
            "id": r.id,
            "payload": bytes_to_json(&r.payload),
        }),
        Some(proto::extension_message::Variant::Keepalive(_)) => serde_json::json!({
            "type": "ping",
        }),
        Some(proto::extension_message::Variant::HotReload(h)) => serde_json::json!({
            "type": "hot-reload",
            "files": h.files,
        }),
        Some(proto::extension_message::Variant::NewEmail(n)) => {
            let email_json = n
                .email
                .map(|e| {
                    serde_json::json!({
                        "subject": e.subject,
                        "sender": e.sender,
                        "body_preview": e.body_preview,
                    })
                })
                .unwrap_or(serde_json::Value::Null);
            serde_json::json!({
                "type": "new_email",
                "email": email_json,
            })
        }
        None => serde_json::json!({ "type": "unknown", "variant": "none" }),
    };
    serde_json::to_string(&json).expect("JSON serialize failed")
}

fn decode_token_message(data: &[u8]) -> String {
    let tok = TokenMessage::decode(data).expect("failed to decode TokenMessage");
    let mut json = serde_json::json!({
        "type": "TokenMessage",
        "platform": tok.platform,
        "tokenType": tok.token_type,
        "token": tok.token,
        "timestamp": tok.timestamp,
    });
    if let Some(url) = tok.url {
        json["url"] = serde_json::Value::String(url);
    }
    serde_json::to_string(&json).expect("JSON serialize failed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_browser_request() {
        let json = r#"{"id":"abc-123","action":"evaluate","payload":{"code":"document.title"}}"#;
        let bytes = serialize_message("BrowserRequest", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "BrowserRequest");
        assert_eq!(parsed["id"], "abc-123");
        assert_eq!(parsed["action"], "evaluate");
        assert_eq!(parsed["payload"]["code"], "document.title");
    }

    #[test]
    fn roundtrip_browser_request_empty_payload() {
        let json = r#"{"id":"x","action":"ping","payload":null}"#;
        let bytes = serialize_message("BrowserRequest", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["id"], "x");
        assert_eq!(parsed["action"], "ping");
        assert!(parsed["payload"].is_null());
    }

    #[test]
    fn roundtrip_extension_response() {
        let json = r#"{"type":"response","id":"r1","payload":{"count":5}}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "response");
        assert_eq!(parsed["id"], "r1");
        assert_eq!(parsed["payload"]["count"], 5);
    }

    #[test]
    fn roundtrip_extension_ping() {
        let json = r#"{"type":"ping"}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "ping");
    }

    #[test]
    fn roundtrip_extension_hot_reload() {
        let json = r#"{"type":"hot-reload","files":["a.js","b.js"]}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "hot-reload");
        assert_eq!(parsed["files"][0], "a.js");
        assert_eq!(parsed["files"][1], "b.js");
    }

    #[test]
    fn roundtrip_extension_hot_reload_no_files() {
        let json = r#"{"type":"hot-reload"}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "hot-reload");
        assert!(parsed["files"].as_array().unwrap().is_empty());
    }

    #[test]
    fn roundtrip_extension_new_email() {
        let json = r#"{"type":"new_email","email":{"subject":"Hello","sender":"bob@test.com","body_preview":"Hi there"}}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "new_email");
        assert_eq!(parsed["email"]["subject"], "Hello");
        assert_eq!(parsed["email"]["sender"], "bob@test.com");
        assert_eq!(parsed["email"]["body_preview"], "Hi there");
    }

    #[test]
    fn roundtrip_extension_new_email_null_fields() {
        let json = r#"{"type":"new_email","email":{"subject":null,"sender":null}}"#;
        let bytes = serialize_message("ExtensionMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "new_email");
        assert!(parsed["email"]["subject"].is_null());
        assert!(parsed["email"]["sender"].is_null());
    }

    #[test]
    fn roundtrip_token_message() {
        let json = r#"{"platform":"gmail","tokenType":"Bearer","token":"ya29.xxx","url":"https://mail.google.com","timestamp":1700000000}"#;
        let bytes = serialize_message("TokenMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["type"], "TokenMessage");
        assert_eq!(parsed["platform"], "gmail");
        assert_eq!(parsed["tokenType"], "Bearer");
        assert_eq!(parsed["token"], "ya29.xxx");
        assert_eq!(parsed["url"], "https://mail.google.com");
        assert_eq!(parsed["timestamp"], 1700000000);
    }

    #[test]
    fn roundtrip_token_message_no_url() {
        let json = r#"{"platform":"gmail","tokenType":"Bearer","token":"ya29.xxx","timestamp":1700000000}"#;
        let bytes = serialize_message("TokenMessage", json);
        let result = deserialize_message(&bytes);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["platform"], "gmail");
        assert!(!parsed["url"].is_null() == false, "url should be absent");
    }

    #[test]
    fn deserialize_unknown_returns_error() {
        let result = deserialize_message(&[0xFF, 0xFF]);
        assert!(result.contains("error"));
    }

    #[test]
    fn deserialize_empty_returns_error() {
        let result = deserialize_message(&[]);
        assert!(result.contains("error"));
    }

    #[test]
    fn protobuf_encode_decode_browser_request() {
        let msg = BrowserRequest {
            id: "test-id".to_string(),
            action: "click".to_string(),
            payload: br#"{"selector":"button"}"#.to_vec(),
        };
        let mut buf = Vec::new();
        msg.encode(&mut buf).unwrap();
        let decoded = BrowserRequest::decode(buf.as_slice()).unwrap();
        assert_eq!(decoded.id, "test-id");
        assert_eq!(decoded.action, "click");
        assert_eq!(decoded.payload, br#"{"selector":"button"}"#);
    }

    #[test]
    fn protobuf_encode_decode_extension_ping() {
        let msg = ExtensionMessage {
            variant: Some(proto::extension_message::Variant::Keepalive(
                KeepaliveMessage {},
            )),
        };
        let mut buf = Vec::new();
        msg.encode(&mut buf).unwrap();
        let decoded = ExtensionMessage::decode(buf.as_slice()).unwrap();
        match decoded.variant {
            Some(proto::extension_message::Variant::Keepalive(_)) => {}
            other => panic!("expected Keepalive, got {:?}", other),
        }
    }

    #[test]
    fn protobuf_encode_decode_token_message() {
        let msg = TokenMessage {
            platform: "outlook".to_string(),
            token_type: "Bearer".to_string(),
            token: "secret-token".to_string(),
            url: Some("https://outlook.live.com".to_string()),
            timestamp: 1700000000,
        };
        let mut buf = Vec::new();
        msg.encode(&mut buf).unwrap();
        let decoded = TokenMessage::decode(buf.as_slice()).unwrap();
        assert_eq!(decoded.platform, "outlook");
        assert_eq!(decoded.url.unwrap(), "https://outlook.live.com");
    }
}
