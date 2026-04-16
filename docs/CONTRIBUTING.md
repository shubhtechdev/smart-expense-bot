# Contributing

Thanks for your interest in improving this project!

## Ways to contribute

- **More category keywords** — add to the `CATEGORY_ROWS` map or improve Gemini prompt rules
- **Better Gemini prompts** — improve accuracy for specific expense types
- **New commands** — `/networth`, `/goal`, receipt parsing
- **Bug fixes** — especially around date parsing or sheet formula edge cases
- **Documentation** — setup guides, examples, screenshots

## How to submit

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Make your changes in `Code.gs`
4. Test with your own Apps Script + Sheet setup
5. Open a Pull Request with:
   - What you changed and why
   - How you tested it
   - Any edge cases to be aware of

## Code style

- Single file (`Code.gs`) — keep everything in one place for easy copy-paste
- Pure JavaScript (ES5 compatible — Apps Script doesn't support ES6+)
- No `let` or `const` — use `var`
- No arrow functions — use `function`
- All computation in JS — Gemini only for natural language tasks
- Comment sections clearly with `// ====` dividers

## Testing

Test against a real Apps Script + Google Sheet setup.
There is no automated test suite (Apps Script doesn't support it well).

At minimum, test:
- Basic expense logging: `250 food`
- Natural language: `800 lunch with team`
- Backdated: `500 rent on 1 apr`
- `/rollup` writing to correct cells
- `/today` returning correct entries
- Any new command you added

## Reporting bugs

Open a GitHub issue with:
- What you sent to the bot
- What you expected
- What actually happened
- Apps Script execution log output (if relevant)
