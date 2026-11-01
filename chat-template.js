'use strict';
/**
 * LFM3 chat template (Jinja2), passed to llama-server with --jinja.
 *
 * Written from Liquid AI's published prompt format for the LFM2/LFM3 family:
 *   <|im_start|>system ... <|im_end|>   (only when a system prompt exists)
 *   <|im_start|>user     ... <|im_end|>
 *   <|im_start|>assistant ... <|im_end|>
 *
 * Keeping the template here (rather than relying on whatever blob is embedded in
 * the GGUF) makes the prompt language-independent and lets us turn thinking on
 * and off per request from the UI.
 */
const LFM3_CHAT_TEMPLATE = `{%- if messages[0]["role"] == "system" %}
    {%- set system_message = messages[0]["content"] %}
    {%- set loop_messages = messages[1:] %}
{%- else %}
    {%- set system_message = "" %}
{%- set loop_messages = messages %}
{%- endif %}
{%- if system_message %}
{{- "<|im_start|>system\\n" + system_message + "<|im_end|>\\n" }}
{%- endif %}
{%- for message in loop_messages %}
    {%- if message["role"] == "assistant" %}
        {%- set content = message["content"] or "" %}
        {%- if message.get("reasoning_content") %}
            {%- set content = "<|reasoning_start|>" + message["reasoning_content"] + "<|reasoning_end|>" + content %}
        {%- endif %}
{{- "<|im_start|>assistant\\n" + content + "<|im_end|>\\n" }}
    {%- elif message["role"] == "tool" %}
{{- "<|im_start|>tool\\n" + (message["content"] or "") + "<|im_end|>\\n" }}
    {%- else %}
{{- "<|im_start|>" + message["role"] + "\\n" + (message["content"] or "") + "<|im_end|>\\n" }}
    {%- endif %}
{%- endfor %}
{%- if add_generation_prompt %}
{{- "<|im_start|>assistant\\n" }}
{%- endif %}`;

module.exports = { LFM3_CHAT_TEMPLATE };
