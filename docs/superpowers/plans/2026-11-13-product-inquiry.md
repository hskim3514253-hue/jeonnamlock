# Product Consultation Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.
**Goal:** Make selected catalog products immediately identifiable in received inquiries.
**Architecture:** Server-validated catalog snapshot in versioned details envelope, decoded by existing admin API. Visible customer/admin product cards, unchanged generic push.
**Tech Stack:** JavaScript, Worker, existing SQLite/D1.
**Spec:** docs/superpowers/specs/2026-11-13-product-inquiry-design.md
## Global Constraints
- No real customer submissions or notification tests in production.
- Preserve plain-text legacy inquiries and current authorization.
## Review Focus
- Unknown ID rejected before persistence.
- Customer notes preserved across selection changes.
- Removed selection absent from request.
- Missing product image gives text-only card.
- Retry/reset and non-product inquiries unchanged.
## Tasks
- [ ] Add failing backend tests for selected product durable admin list/detail and invalid IDs.
- [ ] Generate compact catalog metadata; implement snapshot storage and backward-compatible API decoding.
- [ ] Add client tests for ID submission, card visibility/removal and reset; implement selection cards.
- [ ] Render owner product cards in list/detail with safe DOM APIs.
- [ ] Run all tests/build, local browser flow and independent review, save and deploy allowed version.
