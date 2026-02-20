"""Translation strategy generation based on book analysis."""
from __future__ import annotations

import logging

from . import llm_service
from .. import database as db

log = logging.getLogger(__name__)

STRATEGY_SYSTEM = """\
You are an expert book translator and translation strategist. \
Based on the provided book analysis, create a comprehensive translation strategy \
for translating this book from {source_lang} to {target_lang}.

{custom_instructions}

Return your strategy as a JSON object with exactly these keys:
- "overall_approach": string – translation philosophy (literal vs. free, domestication vs. \
foreignization) and why it suits this book
- "tone_and_style": string – how to maintain the author's voice in the target language, \
register and formality guidelines
- "character_names": list of objects with {{"original": str, "translated": str, "note": str}} \
– how each character name should be handled
- "glossary": list of objects with {{"source": str, "target": str, "context": str}} \
– key terms and their consistent translations
- "cultural_adaptation": string – how to handle cultural references, idioms, humor
- "special_considerations": string – any unique aspects requiring special attention

Be specific and actionable. Each guideline should be clear enough for a translator to follow."""


async def generate_strategy(project_id: str) -> dict:
    project = db.get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")

    analysis = db.get_analysis(project_id)
    if not analysis:
        raise ValueError("No analysis found – run analysis first")

    custom = ""
    existing_strategy = db.get_strategy(project_id)
    if existing_strategy and existing_strategy.get("custom_instructions"):
        custom = (
            "The user has provided the following custom translation instructions. "
            "Incorporate them into your strategy:\n"
            + existing_strategy["custom_instructions"]
        )

    system_prompt = STRATEGY_SYSTEM.format(
        source_lang=project["source_language"],
        target_lang=project["target_language"],
        custom_instructions=custom,
    )

    analysis_text = (
        f"Genre: {analysis.get('genre', '')}\n"
        f"Themes: {', '.join(analysis.get('themes', []))}\n"
        f"Writing Style: {analysis.get('writing_style', '')}\n"
        f"Setting: {analysis.get('setting', '')}\n"
        f"Cultural Notes: {analysis.get('cultural_notes', '')}\n\n"
        f"Characters:\n"
    )
    for ch in analysis.get("characters", []):
        analysis_text += f"  - {ch.get('name', '?')}: {ch.get('description', '')}\n"
    analysis_text += "\nKey Terms:\n"
    for t in analysis.get("key_terms", []):
        analysis_text += f"  - {t.get('term', '?')}: {t.get('explanation', '')}\n"

    log.info("Generating translation strategy for project %s", project_id)
    strategy_data = await llm_service.chat_json(
        system_prompt=system_prompt,
        user_prompt=analysis_text,
        max_tokens=4096,
    )
    strategy_data["raw_strategy"] = str(strategy_data)
    if custom:
        strategy_data["custom_instructions"] = custom

    db.save_strategy(project_id, strategy_data)
    db.update_project(project_id, status="strategy_generated")
    log.info("Strategy generated for project %s", project_id)
    return strategy_data


async def regenerate_strategy(project_id: str, feedback: str) -> dict:
    """Regenerate strategy incorporating user feedback."""
    existing = db.get_strategy(project_id)
    custom = existing.get("custom_instructions", "") if existing else ""
    if feedback:
        custom += f"\n\nUser feedback on previous strategy:\n{feedback}"

    data = dict(existing) if existing else {}
    data["custom_instructions"] = custom
    db.save_strategy(project_id, data)

    return await generate_strategy(project_id)
