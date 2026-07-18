from src.infra.llm.client import LLMClient


def test_openai_models_include_prompt_cache_routing_hints() -> None:
    model = LLMClient._create_model(
        "openai",
        "gpt-4.1",
        temperature=0.7,
        api_key="sk-test",
    )

    assert model.model_kwargs["prompt_cache_key"] == "lambchat:openai:gpt-4.1"
    assert model.model_kwargs["prompt_cache_retention"] == "24h"


def test_openai_compatible_models_receive_cache_params() -> None:
    """All OpenAI-compatible providers (deepseek, qwen, etc.) get prompt cache hints."""
    model = LLMClient._create_model(
        "deepseek",
        "deepseek-chat",
        temperature=0.7,
        api_key="sk-test",
    )

    assert model.model_kwargs["prompt_cache_key"] == "lambchat:deepseek:deepseek-chat"
    assert model.model_kwargs["prompt_cache_retention"] == "24h"


def test_openai_compatible_qwen_receives_cache_params() -> None:
    model = LLMClient._create_model(
        "qwen",
        "qwen-max",
        temperature=0.7,
        api_key="sk-test",
    )

    assert model.model_kwargs["prompt_cache_key"] == "lambchat:qwen:qwen-max"
    assert model.model_kwargs["prompt_cache_retention"] == "24h"
