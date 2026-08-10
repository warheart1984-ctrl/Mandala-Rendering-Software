# Contributing to Axiom-X

Thank you for your interest in contributing to Axiom-X! This project aims to build a constitutional computational substrate for agentic cinema.

## 🤝 Ways to Contribute

- **Code** — Kernels, runtimes, verifiers, bridges
- **Documentation** — Architecture, API, tutorials
- **Testing** — Convergence scenarios, edge cases
- **Integrations** — New backends (Vulkan, CUDA, Metal), partners
- **Governance** — Policy design, constitutional amendments

## 🛠 Development Setup

```bash
# Fork and clone
git clone https://github.com/mandala-rendering/axiom-x.git
cd axiom-x

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -e .[dev]

# Run tests
python axiom_x/test_axiom_x_e2e.py --out-dir tmp/test --determinism-class D2
```

## 📋 Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
2. **Commit** with conventional commits: `git commit -m "feat: add Vulkan backend"`
3. **Push** to your fork: `git push origin feature/amazing-feature`
4. **Open** a Pull Request

### PR Requirements
- [ ] All CI checks pass (validate, test, docker)
- [ ] Tests added for new functionality
- [ ] Documentation updated
- [ ] Conventional commit messages
- [ ] No breaking changes without discussion

## 🏗 Architecture Guidelines

### Adding a New Kernel
1. Place kernel source in `scripts/<category>/`
2. Add to `axiom_x/runtime/axiom_x_runtime.py` if new signature
3. Add CPU reference in `axiom_x/reference/cpu_reference.py`
5. Add convergence test in `test_axiom_x_e2e.py`

### Adding a New Backend
1. Implement `AxiomXRuntime` subclass in `runtime/`
2. Register in `SovereignXBridge._check_capability()`
3. Add compilation pipeline in `AxiomXRuntime.execute_*()`

### Constitutional Amendments
- Propose via GitHub Issue with `constitution` label
- Requires 2 maintainer approvals
- Must not break existing verifications

## 🧪 Testing Standards

### Convergence Testing
```bash
# D1 Exact
python axiom_x/test_axiom_x_e2e.py --determinism-class D1

# D2 Numerical (default)
python axiom_x/test_axiom_x_e2e.py --determinism-class D2

# D3 Semantic
python axiom_x/test_axiom_x_e2e.py --determinism-class D3
```

### Coverage Requirements
- New kernels: ≥1 D2 convergence test
- New backends: CPU↔GPU D2 convergence
- Governance changes: Full bridge test

## 📝 Code Style

- **Python**: Black (line-length 100), type hints required
- **OpenCL C**: clang-format, kernels in separate `.cl` files
- **Commits**: Conventional Commits (feat/fix/docs/refactor/chore)
- **Types**: Full type hints, `from __future__ import annotations`

## 🔒 Security

- **Never commit secrets** — use environment variables
- Report vulnerabilities to `security@axiom-x.org`
- Dependencies scanned via Dependabot

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 💬 Community

- **Discussions**: GitHub Discussions
- **Issues**: Bug reports, feature requests
- **Security**: `security@axiom-x.org`

---

> **"One Math. Many Backends. One Verification. One Evidence."**  
> — Axiom-X Constitutional Principle AX-01