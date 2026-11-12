"""The refresher: twelve short lessons on the theory behind the two quiz modules.

Each lesson is a list of blocks: text, a check question, a Python snippet to run, and the lines to keep.
bank.assemble() calls build(), which checks every stated number before it writes the lessons.
"""
import re
from math import comb, exp, log, perm, sqrt

PARTS = [
    dict(id=1, title="Probability and statistics",
         blurb="For the 2 numeric questions. Answers go to three decimals, so the method has to be exact."),
    dict(id=2, title="Machine learning fundamentals",
         blurb="For the select-all questions. Each lesson holds the handful of facts those questions test."),
]

LESSONS = []
ROUND = "Round your answer to three decimal places."


def lesson(id, part, title, minutes, intro):
    LESSONS.append(dict(id=id, part=part, title=title, minutes=minutes, intro=intro, blocks=[], facts=[]))


def _cur():
    return LESSONS[-1]


def text(html):
    _cur()["blocks"].append(dict(kind="text", html=html.strip()))


def fact(value, shown):
    """A number that the lesson states. build() checks the arithmetic and that the text shows it."""
    _cur()["facts"].append((float(value), shown))


def _check_id():
    return f"{_cur()['id']}-c{sum(1 for b in _cur()['blocks'] if b['kind'] == 'check') + 1}"


def num(stem, exact, explain, decimals=3, tail=True):
    q = dict(id=_check_id(), module=_cur()["part"], type="numeric", title="", lesson=_cur()["id"],
             stem=f"<p>{stem}{' ' + ROUND if tail else ''}</p>", exact=float(exact),
             answer=f"{round(float(exact) + 1e-12, decimals):.{decimals}f}", decimals=decimals, explain=explain, ref="", minutes=0)
    _cur()["blocks"].append(dict(kind="check", q=q))


def pick(stem, options, explain):
    """options: (text, is_correct, why). One correct option makes it single choice."""
    n_true = sum(1 for _, ok, _ in options if ok)
    assert n_true >= 1 and len(options) >= 4, _check_id()
    q = dict(id=_check_id(), module=_cur()["part"], type="single" if n_true == 1 else "multi", title="", lesson=_cur()["id"],
             stem=f"<p>{stem}</p>", options=[dict(text=t, correct=bool(ok), why=w) for t, ok, w in options],
             explain=explain, ref="", minutes=0)
    _cur()["blocks"].append(dict(kind="check", q=q))


def lab(title, code, note):
    _cur()["blocks"].append(dict(kind="lab", title=title, code=code.strip() + "\n", note=note))


def keys(*items):
    _cur()["blocks"].append(dict(kind="keys", items=list(items)))


# =====================================================================================================
# Part 1: probability and statistics
# =====================================================================================================
lesson("prob-rules", 1, "The four rules behind most questions", 8,
       'Most questions in this module come down to four rules. Read the question for the words "at least", "and", "or", and "choose": '
       "each one tells you which rule to use.")

text(r"""
<h3>"At least one": use the complement</h3>
<p>"At least one" covers many cases. "None" is a single case, so work that out and subtract it from 1.</p>
<p class="eq"><mark>\(P(\text{at least one}) = 1 - P(\text{none})\)</mark></p>
<div class="ex"><p><b>Worked example.</b> A sensor misses a defect 5% of the time. Ten sensors check the same part independently. The chance that at least one of them misses it is \(1 - 0.95^{10} = 0.401\).</p></div>
<h3>"And": multiply</h3>
<p>For independent events, multiply the probabilities: \(P(A \text{ and } B) = P(A) \times P(B)\).</p>
<p>When the first event changes the odds of the second, multiply by the updated probability: <mark>\(P(A \text{ and } B) = P(A) \times P(B \mid A)\)</mark>. Drawing without replacement is the usual case.</p>
<div class="ex"><p><b>Worked example.</b> A box holds 4 faulty and 6 good parts. You take two and don't put the first one back. The chance that both are faulty is \(\frac{4}{10} \times \frac{3}{9} = 0.133\).</p></div>
""")
fact(1 - 0.95 ** 10, "0.401")
fact(4 / 10 * 3 / 9, "0.133")

num("Three servers each stay up during a release with probability 0.9, independently. What is the probability that at least one goes down?",
    1 - 0.9 ** 3,
    r"<p>Use the complement. All three stay up with probability \(0.9^{3} = 0.729\), so at least one goes down with probability \(1 - 0.729 = 0.271\).</p>")

text(r"""
<h3>"Or": add, then remove the overlap</h3>
<p class="eq"><mark>\(P(A \text{ or } B) = P(A) + P(B) - P(A \text{ and } B)\)</mark></p>
<p>If the two events can't happen together, the overlap is zero and you only add.</p>
<div class="ex"><p><b>Worked example.</b> 30% of customers use the app, 50% use the website, and 10% use both. The share that uses at least one is 0.30 + 0.50 - 0.10 = 0.70, so 0.30 use neither.</p></div>
<h3>"Choose": count combinations</h3>
<p>The number of ways to choose \(k\) items from \(n\), when the order doesn't matter, is</p>
<p class="eq"><mark>\(\binom{n}{k} = \frac{n!}{k!\,(n-k)!}\)</mark></p>
<p>For small numbers, cancel by hand: \(\binom{10}{3} = \frac{10 \times 9 \times 8}{3 \times 2 \times 1} = 120\). In Python it is <code>math.comb(10, 3)</code>.</p>
<p>When the order does matter, count arrangements instead: \(\frac{n!}{(n-k)!}\). Gold, silver, and bronze among 10 runners can go \(10 \times 9 \times 8 = 720\) ways, which is 6 times the 120 unordered groups of three. In Python it is <code>math.perm(10, 3)</code>.</p>
<p>When every outcome is equally likely, a probability is a ratio of counts: the ways that fit, divided by all the ways.</p>
<div class="ex"><p><b>Worked example.</b> A bag holds 5 red and 3 blue tokens. You pick 2. The chance that both are red is \(\binom{5}{2} / \binom{8}{2} = 10 / 28 = 0.357\).</p></div>
""")
fact(comb(5, 2) / comb(8, 2), "0.357")
assert perm(10, 3) == 720 and comb(10, 3) == 120 and perm(10, 3) == 6 * comb(10, 3)

num("A team of 3 is picked at random from 6 engineers and 4 analysts. What is the probability that all three are engineers?",
    comb(6, 3) / comb(10, 3),
    r"<p>Count the teams. There are \(\binom{6}{3} = 20\) all-engineer teams out of \(\binom{10}{3} = 120\) possible teams: \(20 / 120 = 0.167\).</p>"
    r"<p>The multiply rule gives the same answer: \(\frac{6}{10} \times \frac{5}{9} \times \frac{4}{8} = 0.167\).</p>")

pick("Two events each have a probability above zero, and they are mutually exclusive: they can't both happen. Which statement is true?",
     [("They are not independent.", True, "If one happens, the other can't. Knowing one changes the probability of the other, which is the opposite of independence."),
      ("They are independent.", False, "Independent events can happen together. These can't."),
      ("P(A or B) = P(A) × P(B).", False, '"Or" adds. For mutually exclusive events, P(A or B) = P(A) + P(B).'),
      ("P(A and B) = P(A) + P(B).", False, "They can't both happen, so P(A and B) = 0.")],
     "<p>Mutually exclusive and independent are different ideas. Mutually exclusive means no overlap. Independent means that one event tells you nothing about the other.</p>")

lab("Check a rule by simulation", """
import numpy as np

rng = np.random.default_rng(7)
n = 200_000

# three servers, each up with probability 0.9
up = rng.random((n, 3)) < 0.9
at_least_one_down = (~up).any(axis=1).mean()

print("simulated:", round(at_least_one_down, 3))
print("formula:  ", round(1 - 0.9**3, 3))
""", "Change 0.9, or the number of servers, and run it again. When you have time to spare, a simulation like this is a good way to check an answer.")

keys('"At least one" is 1 minus P(none).',
     '"And" multiplies. Without replacement, update the second probability.',
     '"Or" adds, minus the overlap.',
     '"Choose k from n" is a combination. Probability = ways that fit / all ways.',
     "Keep full precision while you work, and round once at the end.")

# -----------------------------------------------------------------------------------------------------
lesson("prob-bayes", 1, "Conditional probability and Bayes", 9,
       "A test or a model raises a flag. How likely is it that the flag is right? This is the most common question in the module, "
       "and intuition gets it wrong. A table of counts gets it right every time.")

text(r"""
<h3>Conditional probability</h3>
<p>\(P(A \mid B)\) reads "the probability of A given B": of the cases where B happened, the share where A happened too.</p>
<p class="eq"><mark>\(P(A \mid B) = \frac{P(A \text{ and } B)}{P(B)}\)</mark></p>
<div class="ex"><p><b>Worked example.</b> Of 200 customers, 50 are on the premium plan and 150 are on the standard plan. 10 premium customers and 60 standard customers churned.</p>
<p>\(P(\text{churn} \mid \text{premium}) = 10 / 50 = 0.200\). But \(P(\text{premium} \mid \text{churn}) = 10 / 70 = 0.143\). The direction matters.</p></div>
<h3>Bayes with counts</h3>
<p>Questions give you \(P(\text{signal} \mid \text{truth})\) and ask for \(P(\text{truth} \mid \text{signal})\). To turn it around:</p>
<ol><li>Imagine 10,000 cases.</li><li>Split them by the truth, using the base rate.</li><li>Split each group by the signal.</li><li>Divide the true positives by all the positives.</li></ol>
<div class="ex"><p><b>Worked example.</b> A condition affects 1% of people. A test catches 95% of real cases and wrongly flags 8% of healthy people. Someone tests positive.</p>
<table><thead><tr><th></th><th>People</th><th>Test positive</th></tr></thead><tbody><tr><td>Have it</td><td>100</td><td>95</td></tr><tr><td>Don't have it</td><td>9,900</td><td>792</td></tr></tbody></table>
<p>\(P(\text{has it} \mid \text{positive}) = \frac{95}{95 + 792} = 0.107\). Nine positives out of ten are false alarms, because healthy people outnumber sick people 99 to 1.</p></div>
<p>The same thing as a formula. The bottom line is the law of total probability: it adds up every way to get the signal.</p>
<p class="eq"><mark>\(P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B \mid A)\,P(A) + P(B \mid \text{not } A)\,P(\text{not } A)}\)</mark></p>
""")
fact(10 / 70, "0.143")
fact(95 / (95 + 792), "0.107")

num("A spam filter flags 98% of spam and 3% of legitimate email. 20% of all email is spam. An email has been flagged. What is the probability that it is spam?",
    0.98 * 0.2 / (0.98 * 0.2 + 0.03 * 0.8),
    r"<p>Per 10,000 emails: 2,000 are spam, and 1,960 of those are flagged. 8,000 are legitimate, and 240 of those are flagged.</p>"
    r"<p>\(\frac{1960}{1960 + 240} = 0.891\)</p>")

text(r"""
<h3>More than two groups</h3>
<p>Use one row for each group. The bottom of the fraction adds every row.</p>
<div class="ex"><p><b>Worked example.</b> Three machines make 60%, 30%, and 10% of the parts. Their defect rates are 2%, 3%, and 5%. A part is defective. The chance that machine 3 made it is</p>
<p>\(\frac{0.10 \times 0.05}{0.60 \times 0.02 + 0.30 \times 0.03 + 0.10 \times 0.05} = \frac{0.005}{0.026} = 0.192\)</p></div>
<h3>Two signals in a row</h3>
<p>If two tests make their mistakes independently, multiply both likelihoods inside each row, then divide as before.</p>
<div class="ex"><p><b>Worked example.</b> The person from the earlier example takes the same kind of test again and is positive again. Per row: \(0.01 \times 0.95 \times 0.95 = 0.009025\) and \(0.99 \times 0.08 \times 0.08 = 0.006336\).</p>
<p>\(\frac{0.009025}{0.009025 + 0.006336} = 0.588\). One positive gave 0.107. Two give 0.588.</p></div>
<div class="trap"><p><b>Watch for.</b> Check which way the question points before you compute. "Of the flagged ones, how many are real" divides by everything that was flagged. "Of the real ones, how many are flagged" is the number you were given.</p></div>
""")
fact(0.005 / 0.026, "0.192")
fact(0.009025 / (0.009025 + 0.006336), "0.588")

num("A factory has two lines. Line A makes 70% of the units, and 1% of them are defective. Line B makes 30% of the units, and 4% of them are defective. "
    "A unit is defective. What is the probability that it came from line B?",
    0.3 * 0.04 / (0.7 * 0.01 + 0.3 * 0.04),
    r"<p>\(\frac{0.30 \times 0.04}{0.70 \times 0.01 + 0.30 \times 0.04} = \frac{0.012}{0.019} = 0.632\)</p><p>Line B makes fewer units but most of the defects.</p>")

pick("A condition affects 1 person in 1,000. A test catches every real case and wrongly flags 5% of healthy people. About what share of positive results are real?",
     [("About 2%", True, "Per 100,000 people there are 100 real cases, all flagged, and 4,995 false alarms. 100 / 5,095 is about 2%."),
      ("About 20%", False, "That would need a false positive rate near 0.4%."),
      ("About 50%", False, "False alarms outnumber real cases by about 50 to 1 here."),
      ("About 95%", False, "95% is the share of healthy people who test negative, which answers a different question.")],
     "<p>With a rare condition, even a small false positive rate produces far more false alarms than real cases. Start from the base rate.</p>")

lab("Bayes by simulation", """
import numpy as np

rng = np.random.default_rng(1)
n = 1_000_000

spam = rng.random(n) < 0.20
flag = np.where(spam, rng.random(n) < 0.98, rng.random(n) < 0.03)

by_formula = 0.98 * 0.20 / (0.98 * 0.20 + 0.03 * 0.80)
print("P(spam | flagged), simulated:", round(spam[flag].mean(), 3))
print("P(spam | flagged), formula:  ", round(by_formula, 3))
""", "Lower the spam rate from 0.20 to 0.01 in both places and run it again. The filter is the same, but now most flagged email is legitimate.")

keys("P(A | B) = P(A and B) / P(B). The direction matters.",
     "Bayes with counts: 10,000 cases, split by the truth, then by the signal.",
     "Answer = true positives / all positives.",
     "The bottom of the fraction adds every group: the law of total probability.",
     "A rare truth and an imperfect test give mostly false alarms.")

# -----------------------------------------------------------------------------------------------------
lesson("prob-distributions", 1, "Which distribution", 10,
       "When a question counts something (how many succeed, how many arrive, which try is the first to work), a named distribution "
       "gives the answer in one line. The skill is to recognize which one.")

text(r"""
<h3>Which one</h3>
<table><thead><tr><th>The question describes</th><th>Distribution</th><th>\(P(X = k)\)</th><th>Mean</th></tr></thead><tbody>
<tr><td>\(n\) independent tries, each with chance \(p\). Count the successes.</td><td>Binomial</td><td>\(\binom{n}{k} p^{k} (1-p)^{n-k}\)</td><td>\(np\)</td></tr>
<tr><td>Draw \(n\) without replacement from \(N\) items, \(K\) of them special. Count the special ones.</td><td>Hypergeometric</td><td>\(\frac{\binom{K}{k}\binom{N-K}{n-k}}{\binom{N}{n}}\)</td><td>\(nK/N\)</td></tr>
<tr><td>Events arrive at an average rate \(\lambda\) per interval. Count the events.</td><td>Poisson</td><td>\(\frac{e^{-\lambda}\lambda^{k}}{k!}\)</td><td>\(\lambda\)</td></tr>
<tr><td>Repeat a try with chance \(p\) until the first success. Count the tries.</td><td>Geometric</td><td>\((1-p)^{k-1}p\)</td><td>\(1/p\)</td></tr>
</tbody></table>
<h3>Binomial</h3>
<div class="ex"><p><b>Worked example.</b> Ten emails go out, and each is opened with probability 0.3.</p>
<p>Exactly 2 opened: \(\binom{10}{2} \times 0.3^{2} \times 0.7^{8} = 45 \times 0.09 \times 0.0576 = 0.233\).</p>
<p>At most 1 opened: \(0.7^{10} + 10 \times 0.3 \times 0.7^{9} = 0.028 + 0.121 = 0.149\).</p>
<p>At least 2 opened: \(1 - 0.149 = 0.851\).</p></div>
<p><mark>"At least k" is 1 minus the cases below k.</mark> It is almost always the shorter route.</p>
""")
fact(comb(10, 2) * 0.3 ** 2 * 0.7 ** 8, "0.233")
fact(0.7 ** 10, "0.028")
fact(10 * 0.3 * 0.7 ** 9, "0.121")
fact(0.7 ** 10 + 10 * 0.3 * 0.7 ** 9, "0.149")
fact(1 - 0.7 ** 10 - 10 * 0.3 * 0.7 ** 9, "0.851")

num("A model is right on each case with probability 0.8, independently. What is the probability that it is right on exactly 4 of 5 cases?",
    comb(5, 4) * 0.8 ** 4 * 0.2,
    r"<p>Binomial with \(n = 5\) and \(p = 0.8\): \(\binom{5}{4} \times 0.8^{4} \times 0.2 = 5 \times 0.4096 \times 0.2 = 0.4096\), which rounds to 0.410.</p>")

text(r"""
<h3>Without replacement</h3>
<p>When you draw from a small pool and don't put items back, each draw changes the odds, so the binomial is wrong. Count combinations instead.</p>
<div class="ex"><p><b>Worked example.</b> 20 invoices include 5 with errors. An auditor checks 4 at random.</p>
<p>Exactly 1 has an error: \(\frac{\binom{5}{1}\binom{15}{3}}{\binom{20}{4}} = \frac{5 \times 455}{4845} = 0.470\).</p>
<p>None has an error: \(\frac{\binom{15}{4}}{\binom{20}{4}} = \frac{1365}{4845} = 0.282\).</p></div>
<p>If the pool is huge compared with the sample, or items are put back, the draws are close to independent and the binomial is fine.</p>
<h3>Poisson</h3>
<p>Use it for counts of events in time or space when you are given an average rate. <mark>Scale the rate to the interval in the question first.</mark></p>
<div class="ex"><p><b>Worked example.</b> A help desk gets 3 calls an hour on average.</p>
<p>Exactly 1 call in an hour: \(e^{-3} \times 3 = 0.149\). No call in an hour: \(e^{-3} = 0.050\).</p>
<p>No call in 20 minutes: the rate for 20 minutes is 1, so \(e^{-1} = 0.368\).</p></div>
""")
assert comb(15, 3) == 455 and comb(20, 4) == 4845 and comb(15, 4) == 1365
fact(5 * 455 / 4845, "0.470")
fact(1365 / 4845, "0.282")
fact(exp(-3) * 3, "0.149")
fact(exp(-3), "0.050")
fact(exp(-1), "0.368")

num("A shop gets 4 orders an hour on average, and orders follow a Poisson distribution. What is the probability of no order in the next 30 minutes?",
    exp(-2),
    r"<p>Scale the rate first: 4 an hour is 2 per 30 minutes. \(P(0) = e^{-2} = 0.135\).</p>")

text(r"""
<h3>First success</h3>
<p>The first success comes on try \(k\) when the first \(k - 1\) tries fail and the next one works: \((1-p)^{k-1}p\). No success in the first \(k\) tries: \((1-p)^{k}\).</p>
<div class="ex"><p><b>Worked example.</b> Each sales call converts with probability 0.2. First sale on call 3: \(0.8^{2} \times 0.2 = 0.128\). No sale in the first 5 calls: \(0.8^{5} = 0.328\). Calls needed on average: \(1 / 0.2 = 5\).</p></div>
""")
fact(0.8 ** 2 * 0.2, "0.128")
fact(0.8 ** 5, "0.328")

pick("A bag holds 8 good chips and 2 faulty ones. You take 3 without putting any back and count the faulty ones. Which distribution does the count follow?",
     [("Hypergeometric", True, "A small pool and no replacement: each draw changes what is left."),
      ("Binomial with p = 0.2", False, "The binomial needs the same chance on every draw. Here the chance changes after each chip."),
      ("Poisson", False, "Poisson counts events that arrive at an average rate over an interval."),
      ("Geometric", False, "Geometric counts the tries until the first success, not the successes in a fixed number of draws.")],
     "<p>Ask two questions. Is the number of tries fixed? Is the chance the same on every try? Fixed and the same: binomial. Fixed, but the pool shrinks: hypergeometric.</p>")

lab("Three one-line formulas", """
from math import comb, exp, factorial

def binom(n, k, p):
    return comb(n, k) * p**k * (1 - p)**(n - k)

def hyper(N, K, n, k):
    return comb(K, k) * comb(N - K, n - k) / comb(N, n)

def poisson(rate, k):
    return exp(-rate) * rate**k / factorial(k)

at_least_2 = 1 - binom(10, 0, 0.3) - binom(10, 1, 0.3)

print("binomial, n=10, p=0.3, exactly 2:  ", round(binom(10, 2, 0.3), 3))
print("binomial, at least 2:              ", round(at_least_2, 3))
print("hypergeometric, 1 error in 4 of 20:", round(hyper(20, 5, 4, 1), 3))
print("Poisson, rate 3, exactly 1:        ", round(poisson(3, 1), 3))
""", "These three functions are worth being able to type without looking. Change the numbers to check your own answers to the questions in this lesson.")

keys("Fixed tries, same chance, independent: binomial.",
     "Small pool, nothing put back: count combinations.",
     "An average rate: Poisson. Scale the rate to the interval first.",
     '"At least k" is 1 minus the cases below k.',
     "Means: binomial np, Poisson the rate, tries until the first success 1/p.")

# -----------------------------------------------------------------------------------------------------
lesson("prob-expectation", 1, "Expected value, spread, and games with stages", 10,
       "Some questions ask for an average outcome: the expected payoff, or the expected number of attempts. Others chain several steps, "
       "where each step depends on the one before. Both come down to weighting outcomes by their probabilities.")

text(r"""
<h3>Expected value</h3>
<p>Multiply each outcome by its probability and add: <mark>\(E[X] = \sum x \cdot P(x)\)</mark>.</p>
<div class="ex"><p><b>Worked example.</b> A promotion gives 50 points with probability 0.1 and 10 points with probability 0.3. Otherwise it gives nothing. The expected reward is \(50 \times 0.1 + 10 \times 0.3 = 8\) points.</p></div>
<p>Expected values add, even when the parts depend on each other: \(E[X + Y] = E[X] + E[Y]\). So 20 customers who each buy with probability 0.15 give \(20 \times 0.15 = 3\) expected buyers, and you need no distribution to say so.</p>
<h3>Expected number of tries</h3>
<p>Add up the probability that each try happens at all. Try 1 always happens. Try 2 happens only if try 1 failed, and so on.</p>
<div class="ex"><p><b>Worked example.</b> A job is retried until it works, at most 4 times. Each try works with probability 0.5. Expected tries: \(1 + 0.5 + 0.25 + 0.125 = 1.875\).</p></div>
<p>With no limit on the number of tries, the sum comes to <mark>\(1/p\)</mark>.</p>
""")
fact(1 + 0.5 + 0.25 + 0.125, "1.875")

num("You roll a fair die. A six pays 10 points, a four or a five pays 2 points, and anything else costs you 1 point. What is the expected payoff of one roll?",
    10 / 6 + 2 * 2 / 6 - 3 / 6,
    r"<p>\(10 \times \frac{1}{6} + 2 \times \frac{2}{6} - 1 \times \frac{3}{6} = \frac{11}{6} = 1.833\)</p>")

text(r"""
<h3>Variance and standard deviation</h3>
<p>Variance measures spread: \(\text{Var}(X) = E[X^{2}] - (E[X])^{2}\). The standard deviation is its square root.</p>
<p>For independent quantities, <mark>variances add, and standard deviations don't</mark>:</p>
<ul><li>A sum of \(n\) independent values, each with standard deviation \(\sigma\), has standard deviation \(\sigma\sqrt{n}\).</li>
<li>Their average has standard deviation \(\sigma / \sqrt{n}\).</li>
<li>A binomial count has variance \(np(1-p)\).</li></ul>
<div class="ex"><p><b>Worked example.</b> 100 independent trials with \(p = 0.2\): the mean count is 20, the variance is \(100 \times 0.2 \times 0.8 = 16\), and the standard deviation is 4.</p></div>
<h3>Covariance and correlation</h3>
<p>Covariance says whether two quantities move together. Correlation is the covariance divided by both standard deviations, so it has no units and <mark>always lies between -1 and 1</mark>.</p>
<ul><li>It measures straight-line association only. A perfect curve, such as \(y = x^{2}\) around zero, can have a correlation of 0.</li>
<li>Independent quantities have a correlation of 0. A correlation of 0 does not prove independence.</li>
<li>Changing the units, such as from meters to feet, leaves the correlation unchanged.</li></ul>
<p>When two quantities are correlated, the variance of their sum gains a term:</p>
<p class="eq">\(\text{Var}(X + Y) = \text{Var}(X) + \text{Var}(Y) + 2\,\text{Cov}(X, Y)\)</p>
""")

num("Daily sign-ups have a mean of 40 and a standard deviation of 6, and the days are independent. What is the standard deviation of the total over 9 days?",
    6 * sqrt(9),
    r"<p>Variances add: \(9 \times 6^{2} = 324\). The standard deviation is \(\sqrt{324} = 18\). The shortcut is \(6 \times \sqrt{9}\).</p>"
    "<p>Multiplying 6 by 9 is the common mistake. That would be right only if every day had the same value.</p>", tail=False)

text(r"""
<h3>Games with stages</h3>
<p>When a question has steps, track what is left after each step. Multiply along a path, and add across paths. If the question says "at least one", work out the path where it never happens and subtract.</p>
<div class="ex"><p><b>Worked example.</b> A box holds 4 red and 6 blue balls. You draw 2. If both are blue, you set them aside and draw 2 more. What is the chance that you end up with at least one red ball?</p>
<p>The first draw is all blue: \(\binom{6}{2} / \binom{10}{2} = 15 / 45 = 0.333\).</p>
<p>The box now holds 4 red and 4 blue. The second draw is all blue: \(\binom{4}{2} / \binom{8}{2} = 6 / 28 = 0.214\).</p>
<p>No red at all: \(0.333 \times 0.214 = 0.071\). At least one red: \(1 - 0.071 = 0.929\).</p></div>
""")
fact(15 / 45, "0.333")
fact(6 / 28, "0.214")
fact(15 / 45 * 6 / 28, "0.071")
fact(1 - 15 / 45 * 6 / 28, "0.929")

num("You roll a fair die. If the result is below 4, you roll once more and keep the second result. Otherwise you keep the first result. "
    "What is the expected value of the number you keep?",
    0.5 * 5 + 0.5 * 3.5,
    "<p>Half the time the first roll is 4, 5, or 6, and you keep it. The average of those is 5. The other half you roll again, and a fresh roll averages 3.5.</p>"
    r"<p>\(0.5 \times 5 + 0.5 \times 3.5 = 4.25\)</p>", tail=False)

lab("Check a staged game by simulation", """
import numpy as np

rng = np.random.default_rng(3)
first = rng.integers(1, 7, size=500_000)
second = rng.integers(1, 7, size=500_000)
kept = np.where(first < 4, second, first)

print("average kept value:", round(kept.mean(), 3))
print("by the tree:       ", 0.5 * 5 + 0.5 * 3.5)
""", 'Change the rule to "roll again if the first result is below 5". Work out the answer by hand before you run it.')

keys("Expected value = the sum of outcome × probability. Expected values add.",
     "Expected tries: add the chance that each try happens. With no limit, 1/p.",
     "Variances add for independent things. A sum of n has SD σ√n, and an average has σ/√n.",
     "Correlation runs from -1 to 1 and sees straight lines only. Zero does not mean independent.",
     'Staged game: track what is left after each step, and use the complement for "at least one".')

# -----------------------------------------------------------------------------------------------------
lesson("stats-normal", 1, "Normal curves, intervals, and p-values", 11,
       "The other half of this module is statistics: where a value sits in a normal distribution, how precise an average is, "
       "and what an interval or a p-value does and doesn't say.")

text(r"""
<h3>Z-scores</h3>
<p>A z-score says how many standard deviations a value is from the mean: <mark>\(z = \frac{x - \mu}{\sigma}\)</mark>.</p>
<table><thead><tr><th>Range</th><th>Share of a normal distribution</th></tr></thead><tbody>
<tr><td>Within 1 standard deviation of the mean</td><td>68%</td></tr>
<tr><td>Within 2</td><td>95%</td></tr>
<tr><td>Within 3</td><td>99.7%</td></tr>
<tr><td>Above +1, or below -1</td><td>16% each</td></tr>
<tr><td>Above +2, or below -2</td><td>2.5% each</td></tr>
</tbody></table>
<div class="ex"><p><b>Worked example.</b> Test scores are normal with a mean of 70 and a standard deviation of 10.</p>
<p>Above 90 is above \(z = 2\): 2.5%. Between 60 and 80 is within 1: 68%. Between 60 and 90 runs from \(z = -1\) to \(z = 2\): 34% + 47.5% = 81.5%.</p></div>
""")

num("Parcel weights are normal with a mean of 500 g and a standard deviation of 20 g. Using the 68-95-99.7 rule, what is the probability that a parcel weighs less than 460 g?",
    0.025,
    "<p>460 g is 2 standard deviations below the mean. 95% of parcels lie within 2, which leaves 5% for the two tails, and half of that is below: 0.025.</p>")

text(r"""
<h3>How precise is an average</h3>
<p>An average from a sample has its own standard deviation, called the standard error. It shrinks with the square root of the sample size, so four times the data halves it.</p>
<p class="eq"><mark>\(SE_{\text{mean}} = \frac{s}{\sqrt{n}} \qquad SE_{\text{proportion}} = \sqrt{\frac{p(1-p)}{n}}\)</mark></p>
<p>Averages of many independent values are close to normal even when the raw data isn't. That is the central limit theorem, and it is why z-scores work for averages.</p>
<h3>Confidence interval</h3>
<p class="eq"><mark>\(\text{estimate} \pm z \times SE\)</mark></p>
<p>Use \(z = 1.96\) for 95%, 1.645 for 90%, and 2.576 for 99%.</p>
<div class="ex"><p><b>Worked example.</b> 100 orders have a mean of 80 and a standard deviation of 30. \(SE = 30 / \sqrt{100} = 3\). The 95% interval is \(80 \pm 1.96 \times 3\), which is 74.12 to 85.88.</p></div>
<p>The interval is about the mean, not about single orders. "95%" describes the method: it captures the true mean in 95% of samples.</p>
""")
fact(80 - 1.96 * 3, "74.12")
fact(80 + 1.96 * 3, "85.88")

num("In a sample of 900 sessions, 10% convert. Using z = 1.96, what is the lower bound of the 95% confidence interval for the conversion rate?",
    0.1 - 1.96 * sqrt(0.1 * 0.9 / 900),
    r"<p>\(SE = \sqrt{0.10 \times 0.90 / 900} = 0.01\). The lower bound is \(0.10 - 1.96 \times 0.01 = 0.0804\), which rounds to 0.080.</p>")

text(r"""
<h3>Tests and p-values</h3>
<p>A test starts from a null hypothesis, usually "no effect". The p-value is the chance of seeing data at least this extreme if the null is true. A small p-value, usually below 0.05, is evidence against the null.</p>
<ul><li><b>Type I error:</b> you see an effect that isn't there. Its rate is the threshold you chose, such as 5%.</li>
<li><b>Type II error:</b> you miss an effect that is there. Power is the chance of not missing it, and it grows with the sample size and with the size of the effect.</li></ul>
<div class="trap"><p><b>Watch for.</b> A p-value is not the probability that the null is true. "Significant" does not mean "large": with a huge sample, a tiny difference is significant. And "not significant" does not prove that there is no effect.</p></div>
<h3>Four biases to name on sight</h3>
<ul><li><b>Selection bias:</b> the sample leaves out part of the population. Survivorship bias is the case where only the ones that lasted are counted.</li>
<li><b>Confounding:</b> a third factor drives both of the things you compare, so a correlation is not a cause.</li>
<li><b>Simpson's paradox:</b> a trend in every subgroup reverses when the groups are pooled.</li>
<li><b>Regression to the mean:</b> an extreme first measurement tends to be followed by a less extreme one.</li></ul>
""")

pick("Select the true statements.",
     [("A 95% confidence interval gets narrower as the sample grows.", True, "The standard error shrinks with the square root of the sample size."),
      ("A p-value of 0.03 means there is a 3% chance that the null hypothesis is true.", False, "It is the chance of data this extreme if the null is true, not the chance that the null is true."),
      ("Four times the sample size halves the standard error of the mean.", True, "The standard error divides by the square root of n, and the square root of 4 is 2."),
      ("A 99% interval is wider than a 95% interval from the same data.", True, "More confidence needs a larger multiplier: 2.576 in place of 1.96."),
      ("A result that is not significant proves that there is no effect.", False, "The test may lack the power to detect the effect.")],
     "<p>Intervals and tests both run on the standard error. More data shrinks it, which narrows intervals and raises power.</p>")

lab("Exact values with NormalDist", """
from statistics import NormalDist

scores = NormalDist(mu=70, sigma=10)
print("share above 90:     ", round(1 - scores.cdf(90), 4))
print("share from 60 to 90:", round(scores.cdf(90) - scores.cdf(60), 4))

# 95% interval for a mean: 100 orders, mean 80, standard deviation 30
se = 30 / 100**0.5
z = NormalDist().inv_cdf(0.975)
print("z for 95%:", round(z, 3))
print("interval: ", round(80 - z * se, 2), "to", round(80 + z * se, 2))
""", "The rule of thumb says 2.5% lies above 2 standard deviations. The exact value is 2.28%. When a question tells you to use the rule, use the rule.")

keys("z = (value - mean) / SD. 68% within 1, 95% within 2, 99.7% within 3.",
     "SE of a mean = s/√n. SE of a proportion = √(p(1-p)/n).",
     "95% interval = estimate ± 1.96 × SE.",
     "p-value: the chance of data this extreme if there is no effect.",
     "Name the bias: selection, confounding, Simpson's paradox, regression to the mean.")

# =====================================================================================================
# Part 2: machine learning fundamentals
# =====================================================================================================
lesson("ml-fit", 2, "Overfitting, underfitting, and regularization", 9,
       "The most common question in this module gives you a training score and a validation score, and asks what is wrong and what would help. "
       "Two numbers lead to one of two diagnoses.")

text(r"""
<h3>Read the two scores</h3>
<table><thead><tr><th>Training score</th><th>Validation score</th><th>Diagnosis</th></tr></thead><tbody>
<tr><td>Good</td><td>Much worse</td><td><b>Overfitting</b> (high variance). The model memorized noise in the training data.</td></tr>
<tr><td>Poor</td><td>About as poor</td><td><b>Underfitting</b> (high bias). The model is too simple for the pattern.</td></tr>
<tr><td>Good</td><td>About as good</td><td>A sound fit.</td></tr>
</tbody></table>
<p>The two errors trade off. A more complex model has less bias and more variance. The best model sits where the validation error is lowest.</p>
<h3>What helps</h3>
<table><thead><tr><th>Overfitting: reduce variance</th><th>Underfitting: reduce bias</th></tr></thead><tbody>
<tr><td>More training data</td><td>A more flexible model</td></tr>
<tr><td>A simpler model: shallower trees, fewer features</td><td>Better features, interactions, polynomial terms</td></tr>
<tr><td>Stronger regularization</td><td>Weaker regularization</td></tr>
<tr><td>Early stopping, dropout</td><td>Longer training</td></tr>
<tr><td>Averaging many models (bagging)</td><td>Boosting</td></tr>
</tbody></table>
<p><mark>More data helps overfitting. It does not help underfitting.</mark></p>
""")

pick("A decision tree scores 100% on the training set and 71% on the validation set. Select what is likely to help.",
     [("Limit the depth of the tree.", True, "A shallower tree can't isolate single rows."),
      ("Add more training rows.", True, "More data makes noise harder to memorize."),
      ("Let the tree grow deeper.", False, "It already fits the training data perfectly. More depth adds nothing but variance."),
      ("Replace it with a random forest.", True, "Averaging many different trees cuts variance."),
      ("Add polynomial features.", False, "More features give the tree more ways to memorize. That is a fix for underfitting.")],
     "<p>A perfect training score with a much lower validation score is overfitting. Every fix makes the model simpler, averages it, or gives it more data.</p>")

text(r"""
<h3>Regularization</h3>
<p>Regularization adds a penalty for large coefficients to the loss, so the model pays for complexity.</p>
<table><thead><tr><th></th><th>L1 (lasso)</th><th>L2 (ridge)</th></tr></thead><tbody>
<tr><td>Penalty</td><td>The sum of \(|w|\)</td><td>The sum of \(w^{2}\)</td></tr>
<tr><td>Effect</td><td>Sets some coefficients to exactly zero</td><td>Shrinks every coefficient, none to zero</td></tr>
<tr><td>Use it for</td><td>Feature selection, sparse models</td><td>Stability, correlated features</td></tr>
</tbody></table>
<p>A stronger penalty means smaller coefficients, more bias, and less variance. Standardize the features first, because the penalty treats every coefficient alike.</p>
<div class="trap"><p><b>Watch for.</b> scikit-learn names the strength in two ways. In Ridge and Lasso, a larger <code>alpha</code> is stronger. In LogisticRegression and SVC, a larger <code>C</code> is <em>weaker</em>, because C is 1 divided by the strength.</p></div>
<p>Limits on tree depth, early stopping, dropout, and row subsampling do the same job for other models.</p>
""")

pick("You change C from 0.1 to 100 in a LogisticRegression and refit. What do you expect?",
     [("Weaker regularization: the coefficients can grow, and the risk of overfitting rises.", True, "C is the inverse of the strength, so a larger C is a weaker penalty."),
      ("Stronger regularization: the coefficients shrink toward zero.", False, "That is what a smaller C does."),
      ("More coefficients become exactly zero.", False, "Exact zeros come from an L1 penalty, and from making it stronger."),
      ("The optimizer takes larger steps.", False, "C is not a learning rate.")],
     '<p>Read C as "how much the model is allowed to fit". Read alpha as "how much the model is held back".</p>')

pick("As you add training rows, the training error rises a little and the validation error falls. The two curves meet at a high error and stay flat. What does this show?",
     [("High bias. More data will not help much: the model needs more capacity or better features.", True, "The curves have already met, so there is no gap left for more data to close."),
      ("High variance. More data will close the gap.", False, "High variance shows as a wide gap between the curves, and here there is none."),
      ("Data leakage.", False, "Leakage shows as a validation score that is too good, not as a high error."),
      ("A learning rate that is too high.", False, "That shows as a loss that jumps around or grows during training.")],
     '<p>A learning curve answers the question "would more data help". A wide gap says yes. Two curves stuck together at a high error say no.</p>')

lab("Watch a tree overfit", """
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = make_classification(n_samples=600, n_features=20, n_informative=4,
                           flip_y=0.25, random_state=4)
X_tr, X_va, y_tr, y_va = train_test_split(X, y, test_size=0.3, random_state=4)

print("depth  train  validation")
for depth in [1, 2, 3, 5, 8, None]:
    tree = DecisionTreeClassifier(max_depth=depth, random_state=4).fit(X_tr, y_tr)
    train, valid = tree.score(X_tr, y_tr), tree.score(X_va, y_va)
    print(f"{str(depth):>5}  {train:.2f}   {valid:.2f}")
""", "Training accuracy climbs to 1.00 as the tree gets deeper. Validation accuracy peaks at a depth of 2 or 3 and then falls. The gap between the two columns is overfitting. The labels here are noisy on purpose (flip_y), which is what a deep tree ends up memorizing.")

keys("Good on training, poor on validation: overfitting. Poor on both: underfitting.",
     "Overfitting: more data, a simpler model, more regularization, early stopping, averaging.",
     "Underfitting: a richer model or better features, less regularization.",
     "L1 sets coefficients to zero. L2 shrinks them. Scale the features first.",
     "A larger alpha is stronger. A larger C is weaker.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-linear", 2, "Reading linear and logistic models", 11,
       "Expect a question that hands you coefficients or a loss function and asks what they mean. This lesson covers how to read a linear model, "
       "how to read a logistic model, and the three losses the test likes.")

text(r"""
<h3>Linear regression</h3>
<p>\(\hat{y} = b_{0} + b_{1}x_{1} + b_{2}x_{2} + \dots\) Each coefficient is the change in the prediction when its feature rises by one unit and the others stay fixed. The fit minimizes the squared error.</p>
<p>\(R^{2} = 1 - \frac{SSE}{SST}\) is the share of the variance that the model explains. 1 is perfect, and 0 is no better than predicting the mean. On new data it can be negative.</p>
<div class="trap"><p><b>Watch for.</b> A bigger coefficient is not a more important feature unless the features share a scale. Standardize before you compare sizes. Highly correlated features make single coefficients unstable, even when the predictions are fine.</p></div>
<h3>MSE, RMSE, and MAE</h3>
<div class="ex"><p><b>Worked example.</b> The actual values are 3, 5, and 8. The predictions are 4, 5, and 6, so the errors are -1, 0, and 2.</p>
<p>MAE = \((1 + 0 + 2) / 3 = 1.000\). MSE = \((1 + 0 + 4) / 3 = 1.667\). RMSE = \(\sqrt{1.667} = 1.291\).</p></div>
<table><thead><tr><th></th><th>MSE and RMSE</th><th>MAE</th></tr></thead><tbody>
<tr><td>Large errors</td><td>Punished heavily, because they are squared</td><td>Counted in proportion</td></tr>
<tr><td>Outliers</td><td>Sensitive</td><td>Robust</td></tr>
<tr><td>Best constant prediction</td><td>The mean</td><td>The median</td></tr>
</tbody></table>
<p>RMSE is in the units of the target, and it is never smaller than MAE.</p>
""")
fact(5 / 3, "1.667")
fact(sqrt(5 / 3), "1.291")

num("A model predicts 10, 20, and 30. The actual values are 12, 20, and 24. What is the RMSE?",
    sqrt(40 / 3),
    r"<p>The errors are 2, 0, and -6. Their squares add up to 40, so the MSE is \(40 / 3 = 13.333\) and the RMSE is \(\sqrt{13.333} = 3.651\).</p>"
    "<p>The MAE is 2.667. One large miss pulls the RMSE well above it.</p>")

text(r"""
<h3>Logistic regression</h3>
<p>The model adds up a score \(z = b_{0} + b_{1}x_{1} + \dots\) and squashes it into a probability with the sigmoid:</p>
<p class="eq"><mark>\(p = \frac{1}{1 + e^{-z}}\)</mark></p>
<p>The score \(z\) is the log of the odds, \(\ln\frac{p}{1-p}\). So a coefficient acts on the log-odds, and <mark>\(e^{b}\) is the factor by which the odds change</mark> when the feature rises by one unit. A coefficient of 0.69 doubles the odds. A negative coefficient lowers them.</p>
<div class="ex"><p><b>Worked example.</b> With \(b_{0} = -1\) and \(b_{1} = 0.5\), a case with \(x = 4\) has \(z = 1\) and \(p = 1 / (1 + e^{-1}) = 0.731\). Each extra unit of \(x\) multiplies the odds by \(e^{0.5} = 1.649\).</p></div>
<p>Values worth knowing: the sigmoid of 0 is 0.5, of 1 is 0.731, and of 2 is 0.881. The boundary \(p = 0.5\) is where \(z = 0\), which is a straight line in the features.</p>
<h3>Log loss</h3>
<p>Log loss, also called cross-entropy, scores the probabilities and not only the labels. For one case it is <mark>minus the log of the probability the model gave to what happened</mark>. The model's loss is the average over the cases.</p>
<div class="ex"><p><b>Worked example.</b> Three cases, with the probability the model gave to the true class: 0.9, 0.8, and 0.3.</p>
<p>\(-\ln 0.9 = 0.105\), \(-\ln 0.8 = 0.223\), and \(-\ln 0.3 = 1.204\). The log loss is their mean, 0.511.</p></div>
<p>A confident right answer costs almost nothing. A confident wrong answer costs a lot. Always answering 0.5 costs \(\ln 2 = 0.693\) per case.</p>
""")
fact(1 / (1 + exp(-1)), "0.731")
fact(exp(0.5), "1.649")
fact(1 / (1 + exp(-2)), "0.881")
fact(-log(0.9), "0.105")
fact(-log(0.8), "0.223")
fact(-log(0.3), "1.204")
fact((-log(0.9) - log(0.8) - log(0.3)) / 3, "0.511")
fact(log(2), "0.693")

num("A classifier gives the positive class a probability of 0.8 for one case and 0.4 for another. The first case is positive and the second is negative. "
    "What is the log loss, using natural logs?",
    (-log(0.8) - log(0.6)) / 2,
    r"<p>Use the probability given to what happened: 0.8 for the first case, and \(1 - 0.4 = 0.6\) for the second.</p>"
    r"<p>\(\frac{-\ln 0.8 - \ln 0.6}{2} = \frac{0.223 + 0.511}{2} = 0.367\)</p>")

pick('A logistic regression for loan default has a coefficient of 1.1 on "missed a payment last year" (0 or 1) and -0.4 on income, where income is standardized. '
     "Select the correct readings.",
     [("A missed payment multiplies the odds of default by about 3.", True, "e to the power 1.1 is 3.0."),
      ("A missed payment raises the probability of default by 1.1.", False, "Coefficients act on the log-odds. A probability can't rise by more than 1."),
      ("Higher income goes with lower odds of default.", True, "The coefficient is negative."),
      ("One standard deviation more income multiplies the odds by about 0.67.", True, "e to the power -0.4 is 0.67."),
      ("Nobody without a missed payment can get a predicted probability above 0.5.", False, "The intercept and income also move the score, so the model can still predict above 0.5.")],
     "<p>Exponentiate a coefficient to get the factor on the odds. A factor above 1 raises the odds, and a factor below 1 lowers them.</p>")
assert abs(exp(1.1) - 3.0) < 0.01 and abs(exp(-0.4) - 0.67) < 0.005

lab("Sigmoid and log loss by hand", """
from math import exp, log

def sigmoid(z):
    return 1 / (1 + exp(-z))

# a logistic model: z = -1 + 0.5 * x
for x in [0, 2, 4, 6]:
    print(f"x = {x}:  p = {sigmoid(-1 + 0.5 * x):.3f}")
print("each extra unit of x multiplies the odds by", round(exp(0.5), 3))

# log loss for pairs of (true label, predicted probability of 1)
cases = [(1, 0.9), (0, 0.2), (1, 0.3)]
losses = [-log(p if y == 1 else 1 - p) for y, p in cases]
print("losses:", [round(v, 3) for v in losses])
print("log loss (their mean):", round(sum(losses) / len(losses), 3))
""", "Change the last case to (1, 0.01) and run it again. One confident wrong answer dominates the mean.")

keys("A linear coefficient is the change in the prediction per unit.",
     "A logistic coefficient is the change in the log-odds per unit, and e^b is the factor on the odds.",
     "p = 1 / (1 + e^-z).",
     "MSE punishes big misses and follows the mean. MAE is robust and follows the median.",
     "Log loss = minus the log of the probability given to what happened, averaged.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-trees", 2, "Trees, forests, and boosting", 9,
       "Tree models do most of the work in the coding tasks, and the quiz likes to ask how a random forest differs from gradient boosting.")

text(r"""
<h3>One tree</h3>
<p>A tree splits the data on one feature at a time, and it picks the split that makes the two groups purest. A leaf predicts its majority class, or its mean for regression.</p>
<p>Purity for classes is usually measured by Gini impurity: <mark>\(1 - \sum p_{i}^{2}\)</mark>, where \(p_{i}\) is the share of each class in the node. A pure node scores 0, and an even two-class split scores 0.5.</p>
<div class="ex"><p><b>Worked example.</b> A node is 80% positive and 20% negative. Its Gini impurity is \(1 - (0.8^{2} + 0.2^{2}) = 0.32\).</p></div>
<ul><li>It needs no scaling: a split depends only on the order of the values.</li>
<li>It captures non-linear effects and interactions without help.</li>
<li>It can't extrapolate: outside the training range, the prediction is flat.</li>
<li>A deep tree memorizes the training data, and a small change in the data can change the whole tree.</li></ul>
<p>Control it with <code>max_depth</code>, <code>min_samples_leaf</code>, and <code>min_samples_split</code>.</p>
""")
fact(1 - (0.8 ** 2 + 0.2 ** 2), "0.32")

num("A node holds 30 positive and 10 negative cases. What is its Gini impurity?",
    1 - (0.75 ** 2 + 0.25 ** 2),
    r"<p>The shares are 0.75 and 0.25. \(1 - (0.75^{2} + 0.25^{2}) = 1 - 0.625 = 0.375\).</p>")

text(r"""
<h3>Random forest and gradient boosting</h3>
<p>Both combine many trees. They do it in opposite ways.</p>
<table><thead><tr><th></th><th>Random forest</th><th>Gradient boosting</th></tr></thead><tbody>
<tr><td>How the trees are built</td><td>Independently, so in parallel. Each sees a bootstrap sample of the rows, and a random subset of the features at each split.</td><td>One after another. Each new tree fits the errors of the trees so far.</td></tr>
<tr><td>Each tree is</td><td>Deep, with low bias</td><td>Shallow and weak</td></tr>
<tr><td>Mainly reduces</td><td>Variance, by averaging</td><td>Bias, step by step</td></tr>
<tr><td>Adding trees</td><td>Safe. The gain flattens out.</td><td>Can overfit. Stop when validation stops improving.</td></tr>
<tr><td>Noisy labels</td><td>Robust</td><td>Sensitive, because it keeps chasing the errors</td></tr>
<tr><td>Main settings</td><td><code>n_estimators</code>, <code>max_features</code>, <code>min_samples_leaf</code></td><td><code>learning_rate</code>, <code>n_estimators</code>, <code>max_depth</code></td></tr>
</tbody></table>
<p>In boosting, the learning rate scales each tree's contribution. <mark>A smaller learning rate needs more trees</mark>, and it usually generalizes better. In a forest, the rows a tree did not see (its out-of-bag rows) give a free validation score.</p>
""")

pick("A gradient boosting model's validation loss falls for the first 300 trees and rises after that. Its training loss is still falling at 1,000 trees. What should you do?",
     [("Keep about 300 trees, which is early stopping.", True, "Past that point the new trees fit noise in the training data."),
      ("Add trees until the training loss stops falling.", False, "Training loss keeps falling as the model memorizes. Validation loss is the one to watch."),
      ("Raise the learning rate.", False, "Larger steps reach the overfitting point sooner."),
      ("Make each tree deeper.", False, "Deeper trees add capacity, which makes the overfitting worse.")],
     "<p>Boosting can overfit because every new tree chases what is left of the training error. A validation set tells you where to stop.</p>")

pick("Which change makes the trees in a random forest less alike, so that averaging them helps more?",
     [("Consider fewer features at each split.", True, "Each tree is pushed toward different splits, so their errors are less correlated."),
      ("Train every tree on the same rows.", False, "Identical data gives near-identical trees, and averaging copies changes nothing."),
      ("Standardize the features.", False, "Scaling doesn't change the splits a tree picks."),
      ("Grow fewer trees.", False, "The number of trees doesn't change how alike they are.")],
     "<p>Averaging only helps when the models disagree. A forest forces disagreement with random rows and random features.</p>")

text(r"""
<h3>Feature importance</h3>
<p>Impurity-based importance is quick, but it is measured on the training data and it favors features with many distinct values. Permutation importance on validation data is more trustworthy. Correlated features split their importance between them.</p>
""")

lab("One tree, a forest, and boosting", """
from sklearn.datasets import make_classification
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = make_classification(n_samples=800, n_features=20, n_informative=10,
                           flip_y=0.1, random_state=5)
X_tr, X_va, y_tr, y_va = train_test_split(X, y, test_size=0.3, random_state=5)

models = {
    "one deep tree": DecisionTreeClassifier(random_state=5),
    "random forest": RandomForestClassifier(n_estimators=100, random_state=5),
    "boosting": GradientBoostingClassifier(n_estimators=100, random_state=5),
}
print("model           train  validation")
for name, model in models.items():
    model.fit(X_tr, y_tr)
    train, valid = model.score(X_tr, y_tr), model.score(X_va, y_va)
    print(f"{name:<15} {train:.2f}   {valid:.2f}")
""", "The single tree and the forest both fit the training data perfectly, but the forest scores much better on validation, because it averages 100 different trees. Set n_estimators=5 for the forest and run it again to see part of that gain disappear.")

keys("A tree needs no scaling, finds interactions, and overfits when deep.",
     "Gini = 1 minus the sum of the squared class shares. Zero is pure.",
     "Forest: deep trees on random rows and features, averaged. Cuts variance. Parallel.",
     "Boosting: shallow trees in sequence, each fixing the errors so far. Cuts bias. Can overfit.",
     "A smaller learning rate needs more trees. Stop when validation stops improving.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-models", 2, "The other models, in brief", 9,
       "You don't need the math of these models for the test. You need two or three facts about each: what it assumes, what it is sensitive to, "
       "and which setting controls how hard it fits.")

text(r"""
<h3>k-nearest neighbors</h3>
<ul><li>It predicts from the \(k\) closest training points: a vote for classes, an average for numbers.</li>
<li>There is no training step. Prediction is the slow part, because it searches the stored data.</li>
<li><mark>A small k overfits, and a large k underfits.</mark> With \(k = 1\), training accuracy is 100%.</li>
<li>It runs on distances, so scale the features. Many irrelevant features drown the useful distances.</li></ul>
<h3>Naive Bayes</h3>
<ul><li>It applies Bayes' rule and assumes that the features are independent of each other within each class.</li>
<li>It is fast and copes with many features and little data, which is why it suits text.</li>
<li>Correlated features count the same evidence twice, so its probabilities are overconfident.</li>
<li>A value never seen with a class gives a zero probability unless you smooth the counts.</li></ul>
""")

pick("In a k-nearest neighbors classifier, you move from k = 1 to k = 25. What do you expect?",
     [("Training accuracy drops from 100%, and the decision boundary gets smoother.", True, "Each prediction now averages over 25 neighbors, so single noisy points lose their influence."),
      ("Training accuracy stays at 100%.", False, "That holds only for k = 1, where every training point is its own nearest neighbor."),
      ("The model is more likely to overfit.", False, "A larger k smooths the model. Overfitting is the risk at a small k."),
      ("The scale of the features stops mattering.", False, "Distances depend on scale at any k.")],
     "<p>k is the complexity setting, and it runs backwards: a smaller k is a more flexible model.</p>")

text(r"""
<h3>Support vector machines</h3>
<ul><li>An SVM looks for the boundary with the widest margin between the classes. Only the points near the boundary, the support vectors, decide where it goes.</li>
<li>A kernel such as RBF lets the boundary curve.</li>
<li><code>C</code>: a small value means a wide margin and more regularization. A large value fits the training points harder.</li>
<li><code>gamma</code> in the RBF kernel: a large value gives each point a short reach, so the boundary wiggles and overfits.</li>
<li>Scale the features first.</li></ul>
<h3>PCA and k-means</h3>
<p>Both are unsupervised: they never see the target.</p>
<ul><li><b>PCA</b> rotates the features onto uncorrelated directions, ordered by how much variance each one holds. Keep the first few to reduce the number of dimensions. Standardize first, and fit on the training rows only. A direction with little variance can still be predictive.</li>
<li><b>k-means</b> groups points around \(k\) centers. You choose \(k\) in advance, often with an elbow plot. It is sensitive to scale and to where the centers start, and it finds round clusters.</li></ul>
<h3>Who needs scaling</h3>
<table><thead><tr><th>Scale the features</th><th>No need</th></tr></thead><tbody>
<tr><td>k-NN, SVM, k-means, PCA</td><td>Decision trees</td></tr>
<tr><td>Linear and logistic regression with a penalty</td><td>Random forests, gradient boosting</td></tr>
<tr><td>Neural networks</td><td>Naive Bayes</td></tr>
</tbody></table>
<p><mark>Anything built on distances, penalties, or gradient descent needs scaled features.</mark> Trees only look at the order of the values.</p>
""")

pick("Select the true statements.",
     [("An SVM with a very large gamma in the RBF kernel tends to overfit.", True, "Each training point then shapes only its own small neighborhood, so the boundary follows the noise."),
      ("PCA chooses the directions that best predict the target.", False, "PCA never sees the target. It chooses the directions with the most variance."),
      ("k-means needs the number of clusters before it starts.", True, "k is an input. Methods such as the elbow plot help you choose it."),
      ("k-NN gets faster at prediction as the training set grows.", False, "It searches the stored training points, so more data makes prediction slower."),
      ("Only the points nearest the boundary decide where an SVM puts it.", True, "Those are the support vectors. Points far from the boundary can move without changing it.")],
     "<p>For each model, know what it assumes, what it is sensitive to, and which setting makes it fit harder.</p>")

lab("k-NN with and without scaling", """
from sklearn.datasets import load_wine
from sklearn.model_selection import cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, y = load_wine(return_X_y=True)
print("largest value in each of the first 5 features:", X.max(axis=0)[:5].round(1))

raw = KNeighborsClassifier(n_neighbors=5)
scaled = make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5))

raw_score = cross_val_score(raw, X, y, cv=5).mean()
scaled_score = cross_val_score(scaled, X, y, cv=5).mean()
print("k-NN on raw features:   ", round(raw_score, 3))
print("k-NN on scaled features:", round(scaled_score, 3))
""", "The features sit on very different scales, so raw distances are driven by the largest ones. The scaler is inside the pipeline, so each fold fits it on its own training part.")

keys("k-NN: a small k overfits, a large k underfits. Scale first. Slow to predict.",
     "Naive Bayes: assumes independent features. Fast, but overconfident.",
     "SVM: widest margin. A large C or a large gamma fits harder. Scale first.",
     "PCA: directions of most variance, with no target. Fit on the training rows only.",
     "Distances, penalties, and gradients need scaling. Trees don't.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-metrics", 2, "Metrics and thresholds", 11,
       "At least one quiz question, and the whole of the model coding task, depend on reading the right metric. Everything starts from four counts.")

text(r"""
<h3>Four counts</h3>
<table><thead><tr><th></th><th>Predicted positive</th><th>Predicted negative</th></tr></thead><tbody>
<tr><th>Actually positive</th><td>True positive (TP)</td><td>False negative (FN)</td></tr>
<tr><th>Actually negative</th><td>False positive (FP)</td><td>True negative (TN)</td></tr>
</tbody></table>
<table><thead><tr><th>Metric</th><th>Formula</th><th>In words</th></tr></thead><tbody>
<tr><td>Precision</td><td>\(\frac{TP}{TP + FP}\)</td><td>Of the cases you flagged, how many are real</td></tr>
<tr><td>Recall (sensitivity)</td><td>\(\frac{TP}{TP + FN}\)</td><td>Of the real cases, how many you caught</td></tr>
<tr><td>False positive rate</td><td>\(\frac{FP}{FP + TN}\)</td><td>Of the negatives, how many you flagged</td></tr>
<tr><td>F1</td><td>\(\frac{2 \times P \times R}{P + R}\)</td><td>One number that is high only when both are</td></tr>
<tr><td>Accuracy</td><td>\(\frac{TP + TN}{\text{all}}\)</td><td>The share of all cases you got right</td></tr>
</tbody></table>
<div class="ex"><p><b>Worked example.</b> Out of 1,000 cases: TP = 40, FP = 20, FN = 10, and TN = 930.</p>
<p>Precision = 40 / 60 = 0.667. Recall = 40 / 50 = 0.800. F1 = \(\frac{2 \times 0.667 \times 0.800}{0.667 + 0.800} = 0.727\). Accuracy = 0.970. False positive rate = 20 / 950 = 0.021.</p></div>
""")
fact(40 / 60, "0.667")
fact(2 * 40 / (2 * 40 + 20 + 10), "0.727")
fact(20 / 950, "0.021")
fact((40 + 930) / 1000, "0.970")

num("A model produces 72 true positives, 18 false positives, and 48 false negatives. What is its F1 score?",
    2 * 72 / (2 * 72 + 18 + 48),
    r"<p>Precision is \(72 / 90 = 0.8\), and recall is \(72 / 120 = 0.6\).</p>"
    r"<p>\(F1 = \frac{2 \times 0.8 \times 0.6}{0.8 + 0.6} = \frac{0.96}{1.4} = 0.686\)</p>"
    "<p>F1 sits below the plain average of 0.7, because the harmonic mean leans toward the lower number.</p>")

text(r"""
<h3>The threshold</h3>
<p>A classifier outputs a score, and the threshold turns the score into a label. Moving the threshold trades one error for the other.</p>
<ul><li><mark>Raise it:</mark> fewer cases are flagged. Recall falls or stays the same, and precision usually rises.</li>
<li><mark>Lower it:</mark> more cases are flagged. Recall rises or stays the same, and precision usually falls.</li></ul>
<p>Choose it from the costs. If a miss is expensive, as in screening for a disease, favor recall. If a false alarm is expensive, as in blocking a customer's card, favor precision.</p>
<h3>ROC AUC</h3>
<p>The ROC curve plots recall against the false positive rate at every threshold. The area under it, AUC, is <mark>the chance that a random positive gets a higher score than a random negative</mark>. 0.5 is random, and 1 is perfect.</p>
<ul><li>It needs no threshold, and it doesn't change if you rescale the scores without reordering them.</li>
<li>It measures ranking. It says nothing about whether the probabilities are right.</li>
<li>With rare positives it can look strong while precision is poor. Look at the precision-recall curve as well.</li></ul>
<h3>Imbalanced classes</h3>
<p>With 1% positives, a model that always says "negative" is 99% accurate and useless. Report precision, recall, F1, or the area under the precision-recall curve. To do better, use class weights, resample the training rows only, tune the threshold, and stratify the splits.</p>
""")

pick("A fraud model catches too few frauds. The business can afford more manual reviews. Select the sensible moves.",
     [("Lower the decision threshold.", True, "More cases are flagged, so more frauds are caught, at the price of more reviews."),
      ("Use recall as the main metric.", True, "Recall is the share of frauds that are caught, which is the stated problem."),
      ("Raise the decision threshold.", False, "That flags fewer cases, so even fewer frauds are caught."),
      ("Use class weights so that a missed fraud costs more in training.", True, "The model then pays more attention to the rare class."),
      ("Judge the model on accuracy.", False, "With rare fraud, accuracy is high even when every fraud is missed.")],
     '<p>"Catches too few" is a recall problem. The business has said that false alarms are affordable, so trade precision for recall.</p>')

pick("In a dataset with 1% positives, a model has a ROC AUC of 0.95. Which statement is safe?",
     [("It ranks positives above negatives well, but its precision at a useful recall may still be low.", True, "With 99 negatives for each positive, even a small false positive rate yields many false alarms."),
      ("About 95% of the cases it flags are positive.", False, "That would be precision. AUC doesn't give it."),
      ("It classifies 95% of cases correctly.", False, "That would be accuracy, and accuracy depends on the threshold."),
      ("Its predicted probabilities are well calibrated.", False, "AUC only looks at the order of the scores.")],
     "<p>AUC is about ranking. To know what happens at a working threshold, compute precision and recall there.</p>")

lab("Move the threshold", """
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

X, y = make_classification(n_samples=4000, weights=[0.9], flip_y=0.02,
                           random_state=5)
X_tr, X_va, y_tr, y_va = train_test_split(X, y, stratify=y, random_state=5)

proba = LogisticRegression(max_iter=1000).fit(X_tr, y_tr).predict_proba(X_va)[:, 1]
auc = roc_auc_score(y_va, proba)
print("ROC AUC:", round(auc, 3), "(one number for every threshold)")

print("threshold  flagged  precision  recall")
for t in [0.1, 0.3, 0.5, 0.7, 0.9]:
    pred = (proba >= t).astype(int)
    p = precision_score(y_va, pred, zero_division=0)
    r = recall_score(y_va, pred)
    print(f"   {t:.1f}      {pred.sum():4d}     {p:.2f}      {r:.2f}")
""", "As the threshold rises, fewer cases are flagged, recall falls, and precision climbs. This loop is also the tool for the model task when it sets a precision bar: pick the lowest threshold that clears the bar on validation data.")

keys("Precision: of the flagged, how many are real. Recall: of the real, how many you caught.",
     "F1 = 2PR / (P + R).",
     "A higher threshold lowers recall and usually raises precision.",
     "ROC AUC measures ranking. It has no threshold and says nothing about calibration.",
     "With rare positives, skip accuracy.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-validation", 2, "Validation, leakage, and feature preparation", 12,
       "These ideas decide whether a score can be trusted. They appear as quiz questions, and they are the whole point of the data processing task.")

text(r"""
<h3>Three jobs for your data</h3>
<ul><li><b>Training set:</b> fit the model.</li>
<li><b>Validation set:</b> choose between models and settings.</li>
<li><b>Test set:</b> report the result once, at the end. If you tune on it, its score turns optimistic.</li></ul>
<p>Cross-validation reuses the training data. Split it into \(k\) folds, validate on each fold in turn while you train on the rest, and average the scores. Every row is used for validation exactly once.</p>
<table><thead><tr><th>Situation</th><th>Split to use</th></tr></thead><tbody>
<tr><td>Imbalanced classes</td><td>Stratified k-fold, which keeps the class shares in every fold</td></tr>
<tr><td>Several rows per customer, patient, or device</td><td>Group k-fold, which keeps each group in one fold</td></tr>
<tr><td>Data ordered in time</td><td>Train on the past, validate on the future</td></tr>
<tr><td>Tuning and reporting from the same data</td><td>Nested cross-validation</td></tr>
</tbody></table>
<p>Grid search tries every combination of settings. Random search samples them, which covers a large space with fewer fits. <code>GridSearchCV</code> refits the best settings on all the training data when it finishes.</p>
""")

pick("You have three years of daily sales and want to forecast next month. Which validation fits?",
     [("Train on earlier dates and validate on later dates.", True, "It matches how the model will be used: predicting a future that it has not seen."),
      ("Shuffled 5-fold cross-validation.", False, "Shuffling puts future days in the training folds, so the model learns from the future."),
      ("Stratified 5-fold on the sales figure.", False, "Stratifying balances classes. It does nothing about the order in time."),
      ("Leave-one-out cross-validation.", False, "Each held-out day would be surrounded by its neighbors in the training data.")],
     "<p>Split the way the model will be used. For a forecast, that means the validation data comes after the training data.</p>")

text(r"""
<h3>Leakage</h3>
<p>Leakage means the model learned from something it won't have when it predicts for real. The score looks great and then collapses in use. It has three common forms:</p>
<ul><li><b>Preprocessing fitted on all the rows.</b> A scaler, imputer, encoder, feature selector, or PCA fitted before the split has seen the test rows.</li>
<li><b>Features from the future or from the target.</b> "Refund issued" can't be used to predict whether an order is returned.</li>
<li><b>The same entity on both sides.</b> Duplicate rows, or one customer's rows split between train and test.</li></ul>
<p><mark>Split first. Fit every transformer on the training rows only. Then transform both sets with it.</mark></p>
<pre class="code"><code>scaler = StandardScaler().fit(X_train)   # learn from the training rows
X_train_s = scaler.transform(X_train)
X_test_s = scaler.transform(X_test)      # reuse it, never refit</code></pre>
<p>A scikit-learn <code>Pipeline</code> inside cross-validation does this for every fold.</p>
""")

pick("Select the steps that leak.",
     [("Picking the 20 features most correlated with the target on all the rows, then cross-validating a model on those features.", True, "The selection has already seen the validation rows of every fold."),
      ("Using a customer's total spend over the whole year to predict whether they churn in March.", True, "Spend after March is information from the future."),
      ("Fitting a one-hot encoder on the training rows and applying it to the test rows.", False, "That is the correct order: fit on train, transform test."),
      ("Filling missing values in the test set with the median from the training set.", False, "The statistic comes from the training rows only, as it should."),
      ("Removing exact duplicate rows before you split.", False, "That prevents leakage: a duplicate can no longer land on both sides.")],
     "<p>Ask of every step: did anything here use rows, or facts, that the model won't have at prediction time?</p>")

text(r"""
<h3>Feature preparation facts</h3>
<table><thead><tr><th>Step</th><th>What to remember</th></tr></thead><tbody>
<tr><td>Missing values</td><td>Median for skewed numbers, most frequent value for categories. Add a 0/1 "was missing" flag when the gap itself may carry signal.</td></tr>
<tr><td>Encoding</td><td>One-hot for categories with no order. Ordinal for ranks such as low, medium, high. For a category that first appears at prediction time, <code>handle_unknown="ignore"</code> gives all zeros.</td></tr>
<tr><td>Scaling</td><td>Standardize to mean 0 and standard deviation 1, or min-max to the range 0 to 1.</td></tr>
<tr><td>Outliers and skew</td><td>Cap at fences such as Q1 - 1.5 IQR and Q3 + 1.5 IQR. Log-transform right-skewed amounts.</td></tr>
</tbody></table>
<p>Every median, mean, category list, and fence comes from the training rows.</p>
""")

pick("Income is strongly right-skewed, with a few very large values. You are fitting a linear model. What is the usual first step for this feature?",
     [("Log-transform it, for example with log1p.", True, "The log pulls in the long right tail, so a few huge incomes no longer dominate the fit."),
      ("One-hot encode it.", False, "One-hot encoding is for categories. Income is a number."),
      ("Leave it, because linear models are not affected by skew.", False, "A few extreme values can dominate a least-squares fit."),
      ("Min-max scale it with the minimum and maximum of the test set.", False, "The statistics for a transform must come from the training rows.")],
     "<p>For right-skewed amounts such as income, price, or counts, a log transform is the standard move. Trees don't need it, but linear and distance-based models benefit.</p>")

lab("A leak you can measure", """
import numpy as np
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline

rng = np.random.default_rng(5)
X = rng.normal(size=(100, 2000))      # 2,000 features of pure noise
y = rng.integers(0, 2, size=100)      # labels that have nothing to do with X

# wrong: pick the best 20 features using every row, then cross-validate
X_leaky = SelectKBest(f_classif, k=20).fit_transform(X, y)
leaky = cross_val_score(LogisticRegression(), X_leaky, y, cv=5).mean()

# right: the selection is inside the pipeline, so each fold picks its own features
pipe = make_pipeline(SelectKBest(f_classif, k=20), LogisticRegression())
honest = cross_val_score(pipe, X, y, cv=5).mean()

print("selection outside cross-validation:", round(leaky, 2))
print("selection inside the pipeline:     ", round(honest, 2))
""", "The data is noise, so an honest score is close to 0.5. Selecting the features on all the rows first makes noise look like signal. Change the seed in default_rng and run it again: the honest score wobbles around 0.5, and the leaky one stays high.")

keys("Train to fit, validation to choose, test to report once.",
     "Split first. Fit every transformer on the training rows only.",
     "A Pipeline inside cross-validation keeps each fold clean.",
     "Grouped rows: group k-fold. Time order: train on the past.",
     "A score that looks too good is a leak until you have ruled it out.")

# -----------------------------------------------------------------------------------------------------
lesson("ml-nn", 2, "Neural networks and gradient descent", 10,
       "The test stays at fundamentals here: what activation functions do, which output layer goes with which loss, "
       "and how to read a training run that goes wrong.")

text(r"""
<h3>Activations</h3>
<p>Each unit computes a weighted sum of its inputs and passes it through an activation function. <mark>Without a non-linear activation, any number of layers collapses into one linear model.</mark></p>
<table><thead><tr><th>Function</th><th>Output</th><th>Where it goes</th></tr></thead><tbody>
<tr><td>ReLU: \(\max(0, z)\)</td><td>0 and up</td><td>Hidden layers, by default. It is cheap, and its gradient doesn't fade for positive inputs.</td></tr>
<tr><td>Sigmoid</td><td>0 to 1</td><td>The output for a yes/no target. In deep hidden layers it saturates, and the gradients vanish.</td></tr>
<tr><td>Tanh</td><td>-1 to 1</td><td>Hidden layers in older and recurrent networks. It is centered on zero, but it saturates too.</td></tr>
<tr><td>Softmax</td><td>Probabilities that add up to 1</td><td>The output for several classes.</td></tr>
</tbody></table>
<h3>Output layer and loss</h3>
<table><thead><tr><th>Task</th><th>Output activation</th><th>Loss</th></tr></thead><tbody>
<tr><td>Regression</td><td>Linear (none)</td><td>MSE, or MAE</td></tr>
<tr><td>Two classes</td><td>Sigmoid</td><td>Binary cross-entropy (log loss)</td></tr>
<tr><td>Several classes</td><td>Softmax</td><td>Categorical cross-entropy</td></tr>
</tbody></table>
""")

pick("You build a network that sorts images into 10 classes. Which output layer and loss go together?",
     [("Softmax with categorical cross-entropy.", True, "Softmax gives one probability for each class, and cross-entropy is its matching loss."),
      ("Sigmoid with mean squared error.", False, "One sigmoid gives a single yes/no probability, and squared error is a regression loss."),
      ("ReLU with cross-entropy.", False, "ReLU outputs are not probabilities: they can be 0, or far above 1."),
      ("Linear with hinge loss.", False, "That is the support vector machine setup, which gives no probabilities.")],
     "<p>Match the output to the target: a number needs a linear output, a yes/no target needs a sigmoid, and one of several classes needs softmax.</p>")

text(r"""
<h3>Gradient descent</h3>
<p>Training repeats one move: work out the gradient of the loss for every weight, by backpropagation, and step against it.</p>
<p class="eq"><mark>\(w \leftarrow w - \eta \times \text{gradient}\)</mark></p>
<p>\(\eta\) is the learning rate. Too high, and the steps overshoot, so the loss jumps around or grows. Too low, and training crawls.</p>
<div class="ex"><p><b>Worked example.</b> The loss is \(L(w) = (w - 3)^{2}\), so the gradient is \(2(w - 3)\). At \(w = 0\) the gradient is -6. With a learning rate of 0.1, the step gives \(w = 0 - 0.1 \times (-6) = 0.6\), which is closer to the minimum at 3.</p></div>
<ul><li>A batch is the set of rows used for one step. Mini-batches, such as 32 rows, are the norm: noisy, but fast.</li>
<li>An epoch is one pass over all the training rows.</li>
<li>Scale the inputs. Otherwise the loss surface is steep in some directions and flat in others.</li>
<li>Optimizers such as Adam adapt the step size for each weight.</li></ul>
""")

num("The loss is L(w) = (w - 4)², and you start at w = 1 with a learning rate of 0.25. What is w after one step of gradient descent?",
    1 - 0.25 * 2 * (1 - 4),
    r"<p>The gradient is \(2(w - 4) = 2 \times (1 - 4) = -6\).</p><p>\(w = 1 - 0.25 \times (-6) = 2.5\)</p>", tail=False)

text(r"""
<h3>When training goes wrong</h3>
<table><thead><tr><th>What you see</th><th>Likely cause</th><th>What to try</th></tr></thead><tbody>
<tr><td>Training loss jumps around or grows</td><td>The learning rate is too high, or the inputs are not scaled</td><td>Lower the rate, scale the inputs, clip the gradients</td></tr>
<tr><td>Training loss barely moves</td><td>The learning rate is too low, or the gradients vanish</td><td>Raise the rate, use ReLU, use batch normalization</td></tr>
<tr><td>Training loss falls, validation loss rises</td><td>Overfitting</td><td>Early stopping, dropout, weight decay, more data</td></tr>
<tr><td>Every unit in a layer learns the same thing</td><td>All the weights started at the same value</td><td>Random initialization</td></tr>
</tbody></table>
<ul><li><b>Dropout</b> switches off random units during training. It is off at prediction time.</li>
<li><b>Weight decay</b> is an L2 penalty on the weights.</li>
<li><b>Vanishing gradients:</b> in a deep stack of sigmoid or tanh layers, the gradient shrinks at each layer, so the early layers stop learning. ReLU helps.</li></ul>
""")

pick("After epoch 12, the training loss keeps falling and the validation loss starts to rise. Select the reasonable responses.",
     [("Keep the weights from about epoch 12.", True, "That is early stopping: the best validation loss marks the point to keep."),
      ("Add dropout.", True, "Dropout stops units from relying on each other, which limits memorizing."),
      ("Train for more epochs.", False, "The gap is already widening. More epochs widen it further."),
      ("Add weight decay.", True, "An L2 penalty keeps the weights small, which limits how closely the network can fit noise."),
      ("Add more layers.", False, "More capacity makes overfitting worse.")],
     "<p>A falling training loss with a rising validation loss is the neural network version of overfitting. The fixes are the same family as before: stop earlier, regularize, or get more data.</p>")

lab("Four learning rates", """
def loss(w):
    return (w - 3) ** 2

def gradient(w):
    return 2 * (w - 3)

for rate in [0.01, 0.3, 0.9, 1.1]:
    w = 0.0
    path = []
    for step in range(6):
        w = w - rate * gradient(w)
        path.append(round(w, 2))
    print(f"learning rate {rate:.2f}: w = {path}  final loss {loss(w):.3f}")
""", "The minimum is at w = 3. With 0.01 the steps crawl: after six of them, w has barely left 0. With 0.3 they settle on 3. With 0.9 they overshoot from side to side but still close in. With 1.1 every step lands farther away, and the loss grows: that is divergence.")

keys("No non-linear activation, no depth: the network is one linear model.",
     "Hidden layers: ReLU. Two classes: sigmoid with cross-entropy. Several classes: softmax with cross-entropy. A number: linear with MSE.",
     "One step: w becomes w minus the learning rate times the gradient.",
     "Too high a rate diverges. Too low a rate crawls.",
     "Validation loss rising while training loss falls: stop early, add dropout or weight decay.")

# =====================================================================================================
# Which lesson to reread for each question in the sets and the mocks
# =====================================================================================================
SEE = {
    "p1-flag": "prob-bayes", "p1-jobs": "prob-rules", "p1-audit": "prob-distributions", "p1-suppliers": "prob-bayes", "p1-retry": "prob-expectation",
    "p2-churn": "prob-distributions", "p2-signups": "prob-distributions", "p2-normal": "stats-normal", "p2-redraw": "prob-expectation", "p2-converted": "prob-bayes",
    "p3-interval": "stats-normal", "p3-rmse": "ml-linear", "p3-survey": "stats-normal", "p3-logistic": "ml-linear",
    "m1-p1": "prob-bayes", "m1-p2": "prob-distributions", "m2-p1": "prob-rules", "m2-p2": "ml-linear",
    "f1-gap": "ml-fit", "f1-penalties": "ml-fit", "f1-c": "ml-fit", "f1-loss": "ml-nn", "f1-bias": "ml-fit",
    "f2-forest-boost": "ml-trees", "f2-tree": "ml-trees", "f2-knn": "ml-models", "f2-ensembles": "ml-trees", "f2-bayes": "ml-models",
    "f3-threshold": "ml-metrics", "f3-auc": "ml-metrics", "f3-mse-mae": "ml-linear", "f3-imbalance": "ml-metrics", "f3-cv": "ml-validation",
    "f4-leak": "ml-validation", "f4-scaling": "ml-models", "f4-encoding": "ml-validation", "f4-nn": "ml-nn", "f4-output": "ml-nn",
    "m1-f1": "ml-fit", "m1-f2": "ml-fit", "m1-f3": "ml-metrics", "m1-f4": "ml-trees", "m1-f5": "ml-validation", "m1-f6": "ml-nn",
    "m2-f1": "ml-fit", "m2-f2": "ml-models", "m2-f3": "ml-metrics", "m2-f4": "ml-validation", "m2-f5": "ml-models", "m2-f6": "ml-linear",
}

MATH = re.compile(r"\\\((.+?)\\\)", re.S)
TAGS = re.compile(r"<[^>]+>")


def _texts(les):
    """Every piece of prose in a lesson, for the checks below."""
    out = [les["title"], les["intro"]]
    for b in les["blocks"]:
        if b["kind"] == "text":
            out.append(b["html"])
        elif b["kind"] == "check":
            q = b["q"]
            out += [q["stem"], q["explain"]] + [o["text"] + " " + o["why"] for o in q.get("options", [])]
        elif b["kind"] == "lab":
            out += [b["title"], b["note"]]
        else:
            out += b["items"]
    return out


def build(render):
    """Check the lessons and return them with the math rendered. render turns \\( ... \\) into MathML."""
    ids = [les["id"] for les in LESSONS]
    assert len(ids) == len(set(ids)), "duplicate lesson id"
    assert set(SEE.values()) <= set(ids), set(SEE.values()) - set(ids)
    assert set(ids) == set(SEE.values()), f"no question points at: {set(ids) - set(SEE.values())}"
    lessons = []
    for les in LESSONS:
        prose = " ".join(_texts(les))
        # every stated number is right, and the text shows it
        for value, shown in les["facts"]:
            places = len(shown.split(".")[1]) if "." in shown else 0
            assert f"{value:.{places}f}" == shown, f"{les['id']}: {value} is not {shown}"
            assert shown in prose, f"{les['id']}: {shown} is not in the text"
        plain = MATH.sub(" ", prose)
        for bad, name in (("–", "en dash"), ("—", "em dash"), ("$", "dollar sign")):
            assert bad not in prose, f"{les['id']}: {name} near {prose[max(0, prose.index(bad) - 50):prose.index(bad) + 20]!r}"
        assert "!" not in plain, f"{les['id']}: exclamation mark near {plain[max(0, plain.index('!') - 50):plain.index('!') + 20]!r}"
        for word in ("simply", " just ", "please note", "easily", "obviously"):
            assert word not in plain.lower(), f"{les['id']}: filler word {word!r}"
        blocks = []
        n_checks = 0
        for b in les["blocks"]:
            b = dict(b)
            if b["kind"] == "text":
                b["html"] = render(b["html"])
                assert "\\" not in b["html"], f"{les['id']}: a backslash is left in the text"
            elif b["kind"] == "check":
                n_checks += 1
                q = dict(b["q"])
                if q["type"] == "numeric":
                    assert abs(float(q["answer"]) - q["exact"]) <= 0.5 * 10 ** -q["decimals"] + 1e-12, q["id"]
                    shown = q["answer"].rstrip("0").rstrip(".")
                    assert shown in q["explain"], f"{q['id']}: answer {q['answer']} is not shown in the explanation"
                else:
                    assert all(o["why"] for o in q["options"]), q["id"]
                q["stem"] = render(q["stem"])
                q["explain"] = render(q["explain"])
                assert "\\" not in q["stem"] + q["explain"], f"{q['id']}: a backslash is left in the text"
                b["q"] = q
            elif b["kind"] == "lab":
                compile(b["code"], les["id"], "exec")
                long = [ln for ln in b["code"].splitlines() if len(ln) > 84]  # what fits in the card without scrolling
                assert not long, f"{les['id']}: snippet line too long: {long[0]!r}"
            blocks.append(b)
        assert n_checks >= 2 and blocks[-1]["kind"] == "keys", les["id"]
        assert sum(1 for b in blocks if b["kind"] == "lab") == 1, les["id"]
        lessons.append(dict(id=les["id"], part=les["part"], title=les["title"], minutes=les["minutes"], intro=les["intro"], blocks=blocks))
    return dict(parts=PARTS, lessons=lessons)
