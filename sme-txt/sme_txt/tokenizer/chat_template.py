"""
SME-TXT — Chat Template Handling
Constitutional Contract: contract.sme-txt.v1
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ChatMessage:
    """Single chat message"""
    role: str  # "system", "user", "assistant"
    content: str
    name: str | None = None


@dataclass
class ChatTemplate:
    """Chat template configuration"""
    system_prefix: str = ""
    user_prefix: str = "User: "
    user_suffix: str = "\n"
    assistant_prefix: str = "Assistant: "
    assistant_suffix: str = "\n"
    system_role: str = "system"
    user_role: str = "user"
    assistant_role: str = "assistant"
    add_generation_prompt: bool = True
    
    def format(self, messages: list[ChatMessage]) -> str:
        """Format messages using template"""
        parts = []
        
        for msg in messages:
            if msg.role == self.system_role:
                if self.system_prefix:
                    parts.append(self.system_prefix)
                parts.append(msg.content)
            elif msg.role == self.user_role:
                parts.append(self.user_prefix)
                parts.append(msg.content)
                parts.append(self.user_suffix)
            elif msg.role == self.assistant_role:
                parts.append(self.assistant_prefix)
                parts.append(msg.content)
                parts.append(self.assistant_suffix)
        
        if self.add_generation_prompt:
            parts.append(self.assistant_prefix)
        
        return "".join(parts)
    
    def parse(self, text: str) -> list[ChatMessage]:
        """Parse text back to messages (best effort)"""
        # This is a simplified parser; real implementation would be more robust
        messages = []
        current_role = None
        current_content = []
        
        lines = text.split("\n")
        for line in lines:
            if line.startswith(self.user_prefix.rstrip()):
                if current_role:
                    messages.append(ChatMessage(role=current_role, content="\n".join(current_content)))
                current_role = self.user_role
                current_content = [line[len(self.user_prefix):]]
            elif line.startswith(self.assistant_prefix.rstrip()):
                if current_role:
                    messages.append(ChatMessage(role=current_role, content="\n".join(current_content)))
                current_role = self.assistant_role
                current_content = [line[len(self.assistant_prefix):]]
            else:
                current_content.append(line)
        
        if current_role:
            messages.append(ChatMessage(role=current_role, content="\n".join(current_content)))
        
        return messages


# Predefined templates for supported models
SMOLLM_TEMPLATE = ChatTemplate(
    system_prefix="",
    user_prefix="<|user|>\n",
    user_suffix="<|end|>\n",
    assistant_prefix="<|assistant|>\n",
    assistant_suffix="<|end|>\n",
    system_role="system",
    user_role="user",
    assistant_role="assistant",
)

QWEN_TEMPLATE = ChatTemplate(
    system_prefix="",
    user_prefix="<|im_start|>user\n",
    user_suffix="<|im_end|>\n",
    assistant_prefix="<|im_start|>assistant\n",
    assistant_suffix="<|im_end|>\n",
    system_role="system",
    user_role="user",
    assistant_role="assistant",
)

PHI3_TEMPLATE = ChatTemplate(
    system_prefix="",
    user_prefix="<|user|>\n",
    user_suffix="<|end|>\n",
    assistant_prefix="<|assistant|>\n",
    assistant_suffix="<|end|>\n",
    system_role="system",
    user_role="user",
    assistant_role="assistant",
)

TEMPLATE_REGISTRY = {
    "smollm-360m": SMOLLM_TEMPLATE,
    "qwen2.5-0.5b": QWEN_TEMPLATE,
    "phi-3-mini-pruned": PHI3_TEMPLATE,
}


def get_template(model_name: str) -> ChatTemplate:
    """Get chat template for model"""
    return TEMPLATE_REGISTRY.get(model_name, ChatTemplate())


def format_messages(
    messages: list[dict[str, str]],
    model_name: str,
    add_generation_prompt: bool = True,
) -> str:
    """Format messages for a specific model"""
    template = get_template(model_name)
    template.add_generation_prompt = add_generation_prompt
    
    chat_messages = [
        ChatMessage(role=msg["role"], content=msg["content"])
        for msg in messages
    ]
    
    return template.format(chat_messages)


if __name__ == "__main__":
    # Demo
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is 2+2?"},
    ]
    
    for model in ["smollm-360m", "qwen2.5-0.5b", "phi-3-mini-pruned"]:
        formatted = format_messages(messages, model)
        print(f"=== {model} ===")
        print(formatted)
        print()