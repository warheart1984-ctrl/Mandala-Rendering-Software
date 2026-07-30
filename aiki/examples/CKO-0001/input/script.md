# CKO-0001 Draft Script — LLM Evaluation Basics

**Status:** ready-for-script  
**Lifecycle:** draft content for recording — **not published**, **not YouTube-live**  
**Approx. runtime:** 11–13 minutes

---

## [HOOK]

Everyone says their model is better. Better at what? Better according to whom? And—most importantly—better for *your* decision?

In this Research Decoded episode, we cover LLM evaluation basics: why it's hard, how intrinsic and extrinsic evaluation differ, where leaderboards mislead, and how to think about evaluation when you're shipping something real.

---

## [CONTEXT] Why evaluation matters

If you fund a model, pick a vendor, or ship a feature, you are making a bet under uncertainty. Evaluation is how you reduce that uncertainty—or how you accidentally fool yourself.

A claim like “state of the art” is not a measurement. It is a headline. Measurement starts when you say: *on this task, with this data, under these rules, against these alternatives.*

By the end of this video, you should be able to ask better questions of any eval claim you see—including your own.

---

## [METHODS] Intrinsic vs extrinsic

**Intrinsic evaluation** measures the model directly on tasks or benchmarks. Examples: accuracy on a held-out question set, preference win rate between two assistants, or an automated metric on generated text.

Intrinsic eval is useful because it is often cheap, repeatable, and comparable. It is also dangerous when we treat the score as the product.

**Extrinsic evaluation** measures usefulness in a downstream application or workflow. Examples: how many support tickets are resolved without escalation, how much time an editor saves, whether users complete the job they came to do.

Extrinsic eval answers a different question: *does this help the work?* It is usually slower and noisier—and closer to impact.

A practical pattern: use intrinsic screens to reject obvious failures, then run a small extrinsic check before you trust a deployment decision.

---

## [LIMITS] Where evaluations fail

Three failure modes show up again and again.

**First, contamination.** If evaluation items—or close paraphrases—leaked into training, scores inflate without true generalization.

**Second, saturation and gaming.** When everyone tops a benchmark, the number stops discriminating. Teams can also optimize the metric without improving the job.

**Third, the wrong proxy.** A fluent demo can fail domain-critical questions. A model that wins a general leaderboard can still be unsafe or useless for your users.

So when you hear a leaderboard claim, ask: what does this rank measure, and is that what my decision needs?

---

## [PRACTICE] A project checklist

Before you pick metrics, write down the decision. Then ask:

1. What decision will this evaluation change?
2. What failure would be unacceptable for that decision?
3. What cheap intrinsic screen can we run first?
4. What small extrinsic test would prove the job-to-be-done?

If you cannot answer (1) and (2), you are not ready to argue about (3) and (4).

---

## [TAKEAWAY]

Evaluation is a design choice. Measure what the decision needs—not what is convenient, and not what looks best in a slide.

Intrinsic metrics help you screen. Extrinsic outcomes help you decide. Leaderboards are evidence only when their coverage, controls, and relevance match your use case.

---

## [CTA]

If this helped, subscribe for weekly Research Decoded breakdowns. And leave a comment: what evaluation question is your team stuck on right now?
