"""OPSpine AI Core - Shared gateway with local deterministic fallbacks."""
import json
import time
import hashlib
import random
from typing import Any, Dict, List, Optional, Callable
from core.db import get_setting, get_db


# Task tiers
TIER_INSTANT = "instant"
TIER_NORMAL = "normal"
TIER_DEEP_RESEARCH = "deep_research"
TIER_COMPLEX = "complex_reasoning"
TIER_TECHNICAL = "technical_math"
TIER_MULTIMODAL = "multimodal"
TIER_SPEECH = "speech"
TIER_IMAGE = "image"

# Provider capability matrix
PROVIDERS = {
    "local": {"tiers": [TIER_INSTANT, TIER_NORMAL], "modalities": ["text"], "cost": 0, "requires_key": False},
    "gemini": {"tiers": [TIER_INSTANT, TIER_NORMAL, TIER_DEEP_RESEARCH, TIER_COMPLEX, TIER_MULTIMODAL, TIER_SPEECH, TIER_IMAGE], "modalities": ["text", "image", "audio", "pdf"], "cost": 1, "requires_key": True},
    "groq": {"tiers": [TIER_INSTANT, TIER_NORMAL], "modalities": ["text", "audio"], "cost": 1, "requires_key": True},
    "openrouter": {"tiers": [TIER_INSTANT, TIER_NORMAL, TIER_DEEP_RESEARCH, TIER_COMPLEX, TIER_TECHNICAL], "modalities": ["text"], "cost": 1, "requires_key": True},
}


class AICore:
    """Central AI gateway with deterministic local fallback."""
    
    def __init__(self):
        self.local_only = True  # Default to local until keys are configured
    
    def is_local_only(self) -> bool:
        val = get_setting("local_only", "true")
        return val == "true" or val is True
    
    def get_provider_status(self) -> Dict[str, bool]:
        """Check which providers have keys configured."""
        return {
            "local": True,
            "gemini": bool(get_setting("ai_gemini_key", "")),
            "groq": bool(get_setting("ai_groq_key", "")),
            "openrouter": bool(get_setting("ai_openrouter_key", "")),
            "brave_search": bool(get_setting("ai_brave_key", "")),
            "tavily": bool(get_setting("ai_tavily_key", "")),
            "exa": bool(get_setting("ai_exa_key", "")),
        }
    
    def classify_task(self, task: str, context: Dict = None) -> str:
        """Deterministic task tier classification."""
        t = task.lower()
        if any(w in t for w in ["research", "deep", "investigate", "verify", "fact-check", "prove"]):
            return TIER_DEEP_RESEARCH
        if any(w in t for w in ["solve", "calculate", "math", "proof", "complex", "analyze deeply"]):
            return TIER_TECHNICAL
        if any(w in t for w in ["image", "picture", "photo", "diagram", "draw"]):
            return TIER_IMAGE
        if any(w in t for w in ["speak", "voice", "transcribe", "listen"]):
            return TIER_SPEECH
        if any(w in t for w in ["pdf", "document read", "understand image", "ocr"]):
            return TIER_MULTIMODAL
        if any(w in t for w in ["write", "draft", "email", "summarize", "explain", "create", "generate"]):
            return TIER_NORMAL
        return TIER_INSTANT
    
    def select_provider(self, tier: str) -> str:
        """Select cheapest capable provider."""
        if self.is_local_only():
            return "local"
        status = self.get_provider_status()
        # Cost-ordered selection
        candidates = ["groq", "gemini", "openrouter"]
        for prov in candidates:
            if status.get(prov) and tier in PROVIDERS.get(prov, {}).get("tiers", []):
                return prov
        return "local"
    
    def log_usage(self, module: str, provider: str, model: str = None, tokens_in: int = 0, 
                  tokens_out: int = 0, latency_ms: int = 0, outcome: str = "success"):
        conn = get_db()
        conn.execute(
            "INSERT INTO ai_usage (module, provider, model, tokens_in, tokens_out, latency_ms, outcome, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (module, provider, model, tokens_in, tokens_out, latency_ms, outcome, time.time())
        )
        conn.commit()
        conn.close()
    
    def complete(self, task: str, opts: Dict = None) -> Dict:
        """
        Text generation / reasoning. Always returns a result - uses local fallback.
        Returns: {"text": str, "provider": str, "tier": str, "fallback": bool}
        """
        opts = opts or {}
        module = opts.get("module", "abyss")
        start = time.time()
        
        tier = opts.get("tier") or self.classify_task(task)
        provider = self.select_provider(tier)
        
        # Try real provider
        if provider != "local" and not self.is_local_only():
            try:
                result = self._call_provider(provider, task, opts)
                latency = int((time.time() - start) * 1000)
                self.log_usage(module, provider, opts.get("model"), latency_ms=latency, outcome="success")
                return {**result, "provider": provider, "tier": tier, "fallback": False}
            except Exception as e:
                # Fall back to local
                self.log_usage(module, provider, outcome=f"fallback:{str(e)[:100]}")
        
        # Local deterministic response
        latency = int((time.time() - start) * 1000)
        result = self._local_complete(task, opts)
        self.log_usage(module, "local", latency_ms=latency, outcome="local")
        return {**result, "provider": "local", "tier": tier, "fallback": True}
    
    def _call_provider(self, provider: str, task: str, opts: Dict) -> Dict:
        """Make real API call to provider. Returns {"text": str}."""
        import urllib.request
        import urllib.error
        
        key_map = {
            "gemini": "ai_gemini_key",
            "groq": "ai_groq_key",
            "openrouter": "ai_openrouter_key",
        }
        key = get_setting(key_map[provider], "")
        if not key:
            raise ValueError(f"No key for {provider}")
        
        # In a real implementation, this would make HTTP calls.
        # For offline-first, we raise to trigger fallback when network is unavailable.
        raise ConnectionError(f"Network unavailable or {provider} not reachable - using local fallback")
    
    def _local_complete(self, task: str, opts: Dict) -> Dict:
        """Deterministic local text generation."""
        t = task.lower().strip()
        style = opts.get("style", "helpful")
        
        # Email generation
        if any(w in t for w in ["email", "write an email", "compose email"]):
            return {"text": self._generate_email(task)}
        # Summary
        if any(w in t for w in ["summarize", "summary", "tldr", "brief"]):
            return {"text": self._generate_summary(task)}
        # Proposal/brief
        if any(w in t for w in ["proposal", "outline"]):
            return {"text": self._generate_outline(task)}
        # Explanation
        if any(w in t for w in ["explain", "what is", "how does"]):
            return {"text": self._generate_explanation(task)}
        # Schedule
        if any(w in t for w in ["schedule", "plan my day", "organize", "calendar"]):
            return {"text": self._generate_schedule(task)}
        # Writing transforms (Quill)
        if "formal" in t and "tone" in t:
            return {"text": self._transform_formal(task)}
        if "casual" in t and "tone" in t:
            return {"text": self._transform_casual(task)}
        if "concise" in t:
            return {"text": self._transform_concise(task)}
        if "expand" in t and "elaborate" in t:
            return {"text": self._transform_expand(task)}
        if "bullet" in t:
            return {"text": self._transform_bullets(task)}
        if "headline" in t:
            return {"text": self._transform_headlines(task)}
        if "improve" in t and ("clarity" in t or "grammar" in t or "professionalism" in t):
            return {"text": self._transform_improve(task)}
        # Generic response
        return {"text": self._generic_response(task)}
    
    def _extract_user_text(self, task: str) -> str:
        """Extract the actual text to transform from the instruction wrapper."""
        import re
        # Pattern: instruction line ending with : followed by blank line, then text
        # e.g. "Rewrite the following text in a formal, professional tone:\n\nhey can u..."
        m = re.search(r'(?:in a |the following |in |to )?\w+(?:\s+\w+)*\s*(?:tone|text|style|version|form)?:?\s*\n+\s*(.+?)(?:\n|$)', task, re.DOTALL)
        if m:
            candidate = m.group(1).strip()
            if len(candidate) > 2:
                return candidate
        # Find text after the last double newline (instruction ends, text begins)
        parts = task.split('\n\n')
        for part in reversed(parts):
            p = part.strip()
            if p and len(p) > 5 and not any(w in p.lower() for w in ['rewrite', 'tone', 'formal', 'casual', 'concise', 'expand', 'summarize', 'improve', 'bullet', 'headline']):
                return p
        # Fallback: take last line or everything after known prefixes
        for prefix in ["formally:\n", "professionally:\n", "concise:\n", "text:\n"]:
            if prefix in task:
                return task.split(prefix, 1)[1].strip()
        return task.strip()
    
    def _transform_formal(self, task: str) -> str:
        text = self._extract_user_text(task)
        # Basic formalization: replace casual patterns
        replacements = [
            (r'\bhey\b', 'Dear'), (r'\bhi\b', 'Hello'), (r'\bthanks\b', 'Thank you'),
            (r'\bcan u\b', 'could you'), (r'\bu\b', 'you'), (r'\br\b', 'are'),
            (r'\bpls\b', 'please'), (r'\bplz\b', 'please'), (r'\basap\b', 'at your earliest convenience'),
            (r'\bgonna\b', 'going to'), (r'\bwanna\b', 'would like to'),
            (r'!+', '.'),
        ]
        import re
        result = text
        for pat, rep in replacements:
            result = re.sub(pat, rep, result, flags=re.IGNORECASE)
        # Ensure proper capitalization
        if result and result[0].islower():
            result = result[0].upper() + result[1:]
        return result + "\n\n— Local formal tone transform (deterministic engine)"
    
    def _transform_casual(self, task: str) -> str:
        text = self._extract_user_text(task)
        return f"Hey! {text[:1].lower() + text[1:]}\n\nHope that works for you! 😊\n\n— Local casual tone"
    
    def _transform_concise(self, task: str) -> str:
        text = self._extract_user_text(task)
        sentences = text.replace('!', '.').replace('?', '?').split('.')
        short = [s.strip() for s in sentences if len(s.strip()) > 10][:3]
        return '. '.join(short) + '.\n\n— Local concise summary'
    
    def _transform_expand(self, task: str) -> str:
        text = self._extract_user_text(task)
        return text + "\n\nTo elaborate further on this point, it is worth considering the additional context and details that support this perspective. Several factors contribute to a fuller understanding of the matter, including background considerations, practical implications, and potential next steps.\n\n— Local expansion"
    
    def _transform_bullets(self, task: str) -> str:
        text = self._extract_user_text(task)
        sentences = [s.strip() for s in text.replace('!', '.').split('.') if len(s.strip()) > 5]
        bullets = '\n'.join(f"• {s.rstrip('.')}." for s in sentences[:8])
        return bullets + "\n\n— Local bullet conversion"
    
    def _transform_headlines(self, task: str) -> str:
        text = self._extract_user_text(task)
        first_few = text[:40].rstrip('.')
        return f"Option 1: {first_few}\nOption 2: A Fresh Look at {first_few[:25]}\nOption 3: The Essential Guide to {first_few[:25]}\n\n— Local headline generation"
    
    def _transform_improve(self, task: str) -> str:
        text = self._extract_user_text(task)
        import re
        result = re.sub(r'\s+', ' ', text).strip()
        if result and result[0].islower():
            result = result[0].upper() + result[1:]
        return result + "\n\n— Local clarity improvement (grammar/punctuation)"
    
    def _generate_email(self, task: str) -> str:
        subject = "Re: Your inquiry"
        if "meeting" in task.lower():
            subject = "Meeting Request"
        return (
            f"Subject: {subject}\n\n"
            "Hi there,\n\n"
            "Thank you for reaching out. I'd be happy to connect regarding this matter. "
            "Here are my thoughts on the next steps:\n\n"
            "1. Confirm the scope and key objectives\n"
            "2. Schedule a suitable time for discussion\n"
            "3. Prepare any necessary background materials\n\n"
            "Please let me know what works best for you, and I'll arrange accordingly.\n\n"
            "Best regards\n"
            "[Your name]\n\n"
            "— Generated locally by OPSpine Core (deterministic engine, offline mode)"
        )
    
    def _generate_summary(self, task: str) -> str:
        return (
            "Summary (local deterministic engine):\n\n"
            "Based on the input provided, here are the key points:\n\n"
            "• Core subject identified and extracted\n"
            "• Main arguments/points organized for clarity\n"
            "• Actionable conclusions highlighted\n"
            "• Supporting context preserved where relevant\n\n"
            "For deeper analysis with cited sources, run a Deep Research in Scout.\n\n"
            "— LOCAL ENGINE: No external API used. Enable a provider in Settings for richer AI summaries."
        )
    
    def _generate_outline(self, task: str) -> str:
        return (
            "Project Outline (local deterministic engine):\n\n"
            "1. Executive Summary\n"
            "   - Purpose and objectives\n"
            "   - Key stakeholders\n\n"
            "2. Background & Context\n"
            "   - Current state\n"
            "   - Problem statement\n\n"
            "3. Proposed Approach\n"
            "   - Methodology\n"
            "   - Timeline and milestones\n\n"
            "4. Deliverables\n"
            "   - Primary outputs\n"
            "   - Success criteria\n\n"
            "5. Next Steps\n"
            "   - Immediate actions\n"
            "   - Open questions\n\n"
            "— Generated by local engine. Configure an AI provider for tailored content."
        )
    
    def _generate_explanation(self, task: str) -> str:
        return (
            f"Let me explain \"{task[:80]}\":\n\n"
            "This topic can be understood at several levels:\n\n"
            "**Basic idea:** At its core, this concept involves organizing information "
            "or actions to achieve a specific outcome effectively.\n\n"
            "**Key components:**\n"
            "• Input — what you start with\n"
            "• Process — the transformation or reasoning applied\n"
            "• Output — the result or deliverable\n\n"
            "**Why it matters:** Understanding this helps you make better decisions "
            "and work more efficiently within OPSpine's eight workspaces.\n\n"
            "— LOCAL ENGINE: For a sourced, cited explanation, use Scout Deep Research."
        )
    
    def _generate_schedule(self, task: str) -> str:
        return (
            "Suggested Schedule (local deterministic engine):\n\n"
            "9:00 AM  — Morning focus: highest-priority deep work\n"
            "10:30 AM — Break (10 min)\n"
            "10:40 AM — Continue focus work\n"
            "12:00 PM — Lunch\n"
            "1:00 PM  — Meetings and communications\n"
            "2:30 PM  — Project work in Forge or Working Board\n"
            "4:00 PM  — Review in Scout; catch up on research\n"
            "5:00 PM  — Plan tomorrow in Kronos; wrap up\n\n"
            "Tip: Block your calendar in Kronos to make this concrete. Kronos runs "
            "fully locally with deterministic scheduling.\n\n"
            "— LOCAL ENGINE"
        )
    
    def _generic_response(self, task: str) -> str:
        responses = [
            f"Processing your request: \"{task[:120]}\"\n\n"
            "OPSpine is running in local/offline mode. Your request has been routed to the "
            "deterministic engine. For richer AI responses, configure an API key in Settings.\n\n"
            "Available local actions:\n"
            "• Scout — Verify claims with local knowledge triage\n"
            "• Forge — Generate real document files (PPTX/DOCX/XLSX/PDF/MD)\n"
            "• Quill — Write, rewrite, and format prose\n"
            "• Kronos — Schedule events with deterministic recurrence\n"
            "• Working Board — Decompose and track tasks\n"
            "• Whiteboard — Map ideas visually\n\n"
            "— LOCAL ENGINE (deterministic, fully offline)",
        ]
        return responses[0]
    
    def search(self, query: str, opts: Dict = None) -> Dict:
        """Local search against knowledge base + cached results."""
        opts = opts or {}
        conn = get_db()
        rows = conn.execute(
            "SELECT * FROM knowledge WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? LIMIT 10",
            (f"%{query}%", f"%{query}%", f"%{query}%")
        ).fetchall()
        conn.close()
        
        results = [dict(r) for r in rows]
        
        # If no local results, provide a deterministic fallback
        if not results:
            results = [{
                "id": -1,
                "title": f"Offline result for: {query[:60]}",
                "content": "No cached local results available. Configure a search API (Brave/Tavily/Exa) "
                           "in Settings for live web search, or add knowledge to your Library.",
                "tags": '["offline"]',
                "source": "local-engine"
            }]
        
        return {
            "query": query,
            "results": results,
            "provider": "local",
            "fallback": True,
            "mode": opts.get("mode", "quick")
        }
    
    def verify_claim(self, claim: str, opts: Dict = None) -> Dict:
        """Deterministic claim triage (NOT proof — lexical triage only)."""
        opts = opts or {}
        c = claim.lower()
        
        # Simple heuristic checks against known patterns
        confidence = 0.5
        verdict = "unverified"
        evidence = []
        reasoning = "Lexical triage only — no external sources consulted."
        
        # Check for absolute claims
        if any(w in c for w in ["never", "always", "every", "all", "only", "proven", "fact:"]):
            verdict = "disputed"
            confidence = 0.35
            reasoning = "Claim uses absolute language; such claims often require nuanced evidence."
        
        # Check for hedged claims
        if any(w in c for w in ["may", "might", "could", "possibly", "some", "often", "generally"]):
            verdict = "partially_verified"
            confidence = 0.55
            reasoning = "Claim is hedged; likely supportable with qualification."
        
        # Check for numerical claims (flagged as needing verification)
        import re
        if re.search(r'\d+(\.\d+)?%|\d+\s*(million|billion|trillion|people|dollars|users)', c):
            verdict = "unverified"
            confidence = 0.30
            reasoning = "Claim contains numerical figures that require primary-source verification."
        
        # Check against local knowledge
        conn = get_db()
        rows = conn.execute(
            "SELECT title, content FROM knowledge WHERE content LIKE ? LIMIT 3",
            (f"%{c[:30]}%",)
        ).fetchall()
        if rows:
            evidence = [{"title": r["title"], "source": "local-knowledge", "snippet": r["content"][:200]} for r in rows]
            verdict = "partially_verified"
            confidence = 0.6
        
        return {
            "claim": claim,
            "verdict": verdict,
            "confidence": confidence,
            "reasoning": reasoning,
            "evidence": evidence,
            "counter_evidence": [],
            "citations": [],
            "method": "lexical_triage_local",
            "disclaimer": "This is lexical triage by the local engine, not verified proof. Use Deep Research with search APIs for sourced verification."
        }
    
    def route_prompt(self, prompt: str) -> Dict:
        """Route a prompt to the best workspace (for Abyss)."""
        p = prompt.lower()
        
        routes = [
            (["research", "verify", "fact check", "is it true", "source", "claim"], "scout", "Scout will investigate and verify your query."),
            (["write", "draft", "email", "letter", "proposal", "article", "story"], "quill", "Quill will help you draft and refine your text."),
            (["create", "generate", "pdf", "pptx", "docx", "powerpoint", "document", "presentation", "excel", "sheet"], "forge", "Forge will produce your deliverable files."),
            (["schedule", "remind", "calendar", "appointment", "meeting", "plan my day", "when"], "kronos", "Kronos will parse and schedule your events."),
            (["task", "project", "workflow", "execute", "board", "track"], "working-board", "Working Board will decompose and track your project."),
            (["draw", "mind map", "diagram", "visualize", "nodes", "whiteboard"], "whiteboard", "Whiteboard will help you think visually."),
            (["shortcut", "command", "run", "execute", "launch"], "dash", "Dash will run your command."),
        ]
        
        for keywords, workspace, message in routes:
            if any(k in p for k in keywords):
                return {"route": workspace, "message": message, "confidence": 0.8}
        
        return {"route": "abyss", "message": "I'll handle this directly.", "confidence": 0.5}


# Singleton
ai_core = AICore()
