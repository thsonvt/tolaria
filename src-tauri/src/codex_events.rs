pub(crate) fn message_from_error_event(json: &serde_json::Value) -> Option<String> {
    let raw_message = json["message"]
        .as_str()
        .or_else(|| json["error"]["message"].as_str())
        .or_else(|| json["error"].as_str())?;

    clean_error_message(raw_message)
}

pub(crate) fn actionable_stderr_lines(stderr_output: &str) -> Vec<&str> {
    stderr_output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !is_stdin_status_line(line))
        .filter(|line| !is_plugin_manifest_warning(line))
        .take(3)
        .collect()
}

fn clean_error_message(message: &str) -> Option<String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return None;
    }

    serde_json::from_str::<serde_json::Value>(trimmed)
        .ok()
        .and_then(|json| nested_error_message(&json))
        .or_else(|| Some(trimmed.to_string()))
}

fn nested_error_message(json: &serde_json::Value) -> Option<String> {
    json["error"]["message"]
        .as_str()
        .or_else(|| json["message"].as_str())
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string)
}

fn is_stdin_status_line(line: &str) -> bool {
    matches!(
        line,
        "Reading additional input from stdin..." | "Reading prompt from stdin..."
    )
}

fn is_plugin_manifest_warning(line: &str) -> bool {
    line.contains("WARN codex_core::plugins::manifest")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_from_error_event_maps_nested_cli_message() {
        let error = serde_json::json!({
            "type": "error",
            "message": "{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.\"}}"
        });

        assert_eq!(
            message_from_error_event(&error).as_deref(),
            Some("The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.")
        );
    }

    #[test]
    fn message_from_error_event_maps_turn_failed_message() {
        let failed = serde_json::json!({
            "type": "turn.failed",
            "error": {
                "message": "{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Model is not available to this CLI.\"}}"
            }
        });

        assert_eq!(
            message_from_error_event(&failed).as_deref(),
            Some("Model is not available to this CLI.")
        );
    }

    #[test]
    fn actionable_stderr_lines_ignore_non_actionable_stdin_noise() {
        let lines = actionable_stderr_lines(
            "Reading additional input from stdin...\n2026-05-05T08:00:00.000000Z  WARN codex_core::plugins::manifest: plugin warning\nreal error\n",
        );

        assert_eq!(lines, vec!["real error"]);
    }
}
