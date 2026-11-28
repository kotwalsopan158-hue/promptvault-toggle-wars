# Bench-test handoff

## Inputs

- `board`
- `observations`

## Reusable prompt

```text
Write a short handoff for the next person testing {{board}}.

Test observations
{{observations}}

Give three bullet points: what happened, what is still uncertain, and one check to try next. Use only the observations supplied.
```
