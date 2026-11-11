"""Quiz questions, question sets, mocks, and the eight-session plan. build.py calls assemble()."""
import re
from math import comb, exp, sqrt

import latex2mathml.converter as l2m

MODULES = [
    dict(id=1, name="Probability and statistics", short="Probability", topic="probability and statistics", minutes=12, target=10, unit="correct answers",
         kind="quiz", blurb="2 quiz questions. Numeric answers to 3 decimals."),
    dict(id=2, name="Machine learning fundamentals", short="ML fundamentals", topic="machine learning", minutes=13, target=16, unit="correct answers",
         kind="quiz", blurb="4 to 6 quiz questions, often select all that apply."),
    dict(id=3, name="Data collection", short="Collection", topic="data collection", minutes=22, target=5, unit="tasks solved",
         kind="code", blurb="1 coding question. Join files into one exact table."),
    dict(id=4, name="Data processing", short="Processing", topic="data processing", minutes=15, target=4, unit="tasks solved",
         kind="code", blurb="1 coding question. Impute, encode, scale, with no leakage."),
    dict(id=5, name="Model development and evaluation", short="Model", topic="model development", minutes=23, target=3, unit="tasks solved",
         kind="code", blurb="1 coding question. Train, predict, clear a metric bar."),
]

Q = []


def numeric(id, title, stem, exact, explain, ref, decimals=3, minutes=6, module=1):
    Q.append(dict(id=id, module=module, type="numeric", title=title, stem=stem, exact=float(exact),
                  answer=f"{round(float(exact) + 1e-12, decimals):.{decimals}f}", decimals=decimals,
                  explain=explain, ref=ref, minutes=minutes))


def choice(id, title, stem, options, explain, ref, module=2, minutes=2):
    """options: (text, is_correct, why). One correct option makes a single-choice question."""
    n_true = sum(1 for _, ok, _ in options if ok)
    assert n_true >= 1 and len(options) >= 4, id
    Q.append(dict(id=id, module=module, type="single" if n_true == 1 else "multi", title=title, stem=stem,
                  options=[dict(text=t, correct=bool(ok), why=w) for t, ok, w in options],
                  explain=explain, ref=ref, minutes=minutes))


ROUND = " Round your answer to three decimal places (for example, 0.123)."

# ================================================================ probability: set P1
numeric("p1-flag", "Flagged transactions",
        "<p>A fraud model flags 2% of all card transactions for review. Fraud makes up 0.5% of transactions, and the model flags 90% of fraudulent transactions.</p>"
        "<p>A transaction has been flagged. What is the probability that it is fraudulent?" + ROUND + "</p>",
        0.90 * 0.005 / 0.02,
        r"<p>Use Bayes' theorem. The overall flag rate is given, so you don't need the law of total probability.</p>"
        r"<p>\(P(\text{fraud} \mid \text{flag}) = \frac{P(\text{flag} \mid \text{fraud})\,P(\text{fraud})}{P(\text{flag})} = \frac{0.90 \times 0.005}{0.02} = 0.225\)</p>"
        "<p>Check with counts: of 10,000 transactions, 50 are fraud and 45 of those are flagged. 200 are flagged in total. 45 / 200 = 0.225.</p>",
        "Cheatsheet page 2: Core rules, Bayes with counts")

numeric("p1-jobs", "Nightly jobs",
        "<p>A data pipeline runs 8 independent jobs each night. Each job fails with probability 0.03.</p>"
        "<p>What is the probability that at least one job fails tonight?" + ROUND + "</p>",
        1 - 0.97 ** 8,
        r'<p>"At least one" is the complement of "none".</p><p>\(P(\text{none fail}) = 0.97^{8} = 0.7837\), so \(P(\text{at least one}) = 1 - 0.7837 = 0.216\).</p>',
        "Cheatsheet page 2: Core rules")

numeric("p1-audit", "Audit sample",
        "<p>A batch holds 25 records, and 5 of them are corrupted. An analyst picks 4 records at random, without replacement.</p>"
        "<p>What is the probability that exactly one of the 4 records is corrupted?" + ROUND + "</p>",
        comb(5, 1) * comb(20, 3) / comb(25, 4),
        r"<p>Sampling without replacement from a finite pool is hypergeometric. Choose 1 of the 5 corrupted records and 3 of the 20 clean ones.</p>"
        r"<p>\(\frac{\binom{5}{1}\binom{20}{3}}{\binom{25}{4}} = \frac{5 \times 1140}{12650} = 0.451\)</p>"
        "<p>A binomial with p = 0.2 gives 0.410, which is wrong here because the draws are not independent.</p>",
        "Cheatsheet page 2: Which distribution, Distribution facts")

numeric("p1-suppliers", "Three suppliers",
        "<p>A plant buys one part from three suppliers. Supplier A delivers 50% of the parts, B delivers 30%, and C delivers 20%. Their defect rates are 1%, 2%, and 4%.</p>"
        "<p>A part picked at random is defective. What is the probability that it came from supplier C?" + ROUND + "</p>",
        0.2 * 0.04 / (0.5 * 0.01 + 0.3 * 0.02 + 0.2 * 0.04),
        r"<p>First get the overall defect rate with the law of total probability: \(0.5 \times 0.01 + 0.3 \times 0.02 + 0.2 \times 0.04 = 0.019\).</p>"
        r"<p>Then apply Bayes: \(P(C \mid \text{defect}) = \frac{0.2 \times 0.04}{0.019} = 0.421\).</p>"
        "<p>C supplies a fifth of the parts but causes about two fifths of the defects.</p>",
        "Cheatsheet page 2: Core rules")

numeric("p1-retry", "Retry budget",
        "<p>A support bot resolves a ticket with probability 0.6 on each attempt, independently of earlier attempts. It stops as soon as the ticket is resolved, and it makes at most 3 attempts.</p>"
        "<p>What is the expected number of attempts per ticket?" + ROUND + "</p>",
        1 + 0.4 + 0.4 ** 2,
        "<p>Add up the probability that each attempt happens. Attempt 1 always happens. Attempt 2 happens if attempt 1 failed (0.4). Attempt 3 happens if the first two failed (0.16).</p>"
        r"<p>\(E = 1 + 0.4 + 0.16 = 1.560\)</p>"
        "<p>The same answer from the distribution: 1 attempt with probability 0.6, 2 with 0.24, and 3 with 0.16.</p>",
        "Cheatsheet page 2: Expectation and variance")

# ================================================================ probability: set P2
numeric("p2-churn", "Churn count",
        "<p>Twelve customers each churn this month with probability 0.15, independently of each other.</p>"
        "<p>What is the probability that exactly 2 of them churn?" + ROUND + "</p>",
        comb(12, 2) * 0.15 ** 2 * 0.85 ** 10,
        r"<p>A fixed number of independent trials with the same probability is binomial.</p>"
        r"<p>\(\binom{12}{2} \times 0.15^{2} \times 0.85^{10} = 66 \times 0.0225 \times 0.1969 = 0.292\)</p>",
        "Cheatsheet page 2: Distribution facts")

numeric("p2-signups", "Signups per hour",
        "<p>A site gets 2.5 signups per hour on average, and the number of signups in an hour follows a Poisson distribution.</p>"
        "<p>What is the probability of at least 3 signups in the next hour?" + ROUND + "</p>",
        1 - exp(-2.5) * (1 + 2.5 + 2.5 ** 2 / 2),
        r"<p>Use the complement: \(P(X \ge 3) = 1 - P(0) - P(1) - P(2)\).</p>"
        r"<p>\(P(X \le 2) = e^{-2.5}\left(1 + 2.5 + \frac{2.5^{2}}{2}\right) = 0.0821 \times 6.625 = 0.544\), so the answer is \(1 - 0.544 = 0.456\).</p>",
        "Cheatsheet page 2: Distribution facts")

choice("p2-normal", "Delivery times",
       "<p>Delivery times are normally distributed with a mean of 40 minutes and a standard deviation of 6 minutes.</p>"
       "<p>About what share of deliveries take between 34 and 52 minutes?</p>",
       [("About 0.68", False, "That is the share within 1 standard deviation on both sides: 34 to 46 minutes."),
        ("About 0.815", True, "34 is 1 standard deviation below the mean and 52 is 2 above: 0.34 + 0.475."),
        ("About 0.84", False, "That is the share below 1 standard deviation above the mean."),
        ("About 0.95", False, "That is the share within 2 standard deviations on both sides: 28 to 52 minutes."),
        ("About 0.975", False, "That is the share below 2 standard deviations above the mean.")],
       "<p>Convert both ends to z-scores: 34 is at z = -1 and 52 is at z = 2. From the 68-95-99.7 rule, half of 68% lies between -1 and 0, and half of 95% lies between 0 and 2.</p><p>0.34 + 0.475 = 0.815.</p>"
       "<p>A calculator gives 0.819, because the rule rounds its percentages. 0.815 is still the closest option.</p>",
       "Cheatsheet page 2: Normal distribution", module=1, minutes=4)

numeric("p2-redraw", "Redraw",
        "<p>A deck has 12 cards, and 3 of them are gold. You draw 4 cards. If none of them is gold, you set those 4 cards aside and draw 4 new cards from the remaining 8. Otherwise you keep your hand.</p>"
        "<p>What is the probability that your final hand holds at least one gold card?" + ROUND + "</p>",
        1 - (comb(9, 4) / comb(12, 4)) * (comb(5, 4) / comb(8, 4)),
        "<p>You end with no gold card only if both draws miss. Track what is left in the deck at each stage.</p>"
        r"<p>First draw misses: \(\binom{9}{4} / \binom{12}{4} = 126 / 495 = 0.2545\).</p>"
        r"<p>The remaining 8 cards hold all 3 gold cards and 5 others. Second draw misses: \(\binom{5}{4} / \binom{8}{4} = 5 / 70 = 0.0714\).</p>"
        r"<p>\(1 - 0.2545 \times 0.0714 = 0.982\)</p>",
        "Cheatsheet page 2: Worked examples (multi-stage game)", minutes=8)

numeric("p2-converted", "Converted visitors",
        "<p>Of 200 visitors, 120 used the mobile app and 80 used the website. 45 of the mobile visitors bought something, and 25 of the website visitors did.</p>"
        "<p>A visitor who bought something is picked at random. What is the probability that this visitor used the mobile app?" + ROUND + "</p>",
        45 / 70,
        "<p>Condition on the buyers. There are 45 + 25 = 70 buyers, and 45 of them used the app.</p>"
        r"<p>\(P(\text{mobile} \mid \text{bought}) = 45 / 70 = 0.643\)</p>"
        "<p>The question asks for P(mobile | bought), not P(bought | mobile), which is 45 / 120 = 0.375.</p>",
        "Cheatsheet page 2: Core rules")

# ================================================================ statistics: set P3
numeric("p3-interval", "Interval for a mean",
        "<p>A random sample of 400 orders has a mean value of 52.0 and a standard deviation of 8.0.</p>"
        "<p>Using z = 1.96, what is the upper bound of the 95% confidence interval for the mean order value?" + ROUND + "</p>",
        52 + 1.96 * 8 / sqrt(400),
        r"<p>The standard error of the mean is \(8 / \sqrt{400} = 0.4\).</p><p>\(52 + 1.96 \times 0.4 = 52.784\)</p>"
        "<p>The interval is 51.216 to 52.784. It describes the mean, not individual orders.</p>",
        "Cheatsheet page 3: Sampling, Confidence intervals", minutes=5)

numeric("p3-rmse", "RMSE by hand",
        "<p>A model predicts 10, 12, 15, and 20 for four houses. The actual values are 12, 11, 15, and 16.</p>"
        "<p>What is the root mean squared error?" + ROUND + "</p>",
        sqrt(((12 - 10) ** 2 + (11 - 12) ** 2 + 0 + (16 - 20) ** 2) / 4),
        r"<p>The errors are 2, -1, 0, and -4. Their squares add up to \(4 + 1 + 0 + 16 = 21\).</p>"
        r"<p>\(\text{MSE} = 21 / 4 = 5.25\) and \(\text{RMSE} = \sqrt{5.25} = 2.291\).</p>"
        "<p>The MAE is 1.75. The single large miss pulls the RMSE well above it.</p>",
        "Cheatsheet page 3: Linear regression", minutes=5)

choice("p3-survey", "Survey of active users",
       "<p>A product team wants to know how satisfied all registered users are. It surveys the users who opened the app in the past week and reports 91% satisfaction.</p>"
       "<p>Which problem best explains why this number is likely too high?</p>",
       [("Selection bias: users who stopped opening the app are left out, and they are likely to be less satisfied.", True,
         "The sample covers only the users who stayed, so it does not represent all registered users."),
        ("Regression to the mean: an extreme first measurement is followed by a less extreme one.", False,
         "Nothing is measured twice here."),
        ("Simpson's paradox: a trend in every subgroup reverses when the groups are pooled.", False,
         "No subgroups are compared."),
        ("Multicollinearity: two survey questions are highly correlated.", False,
         "That affects regression coefficients, not who is in the sample."),
        ("The central limit theorem does not apply because the sample is too small.", False,
         "Sample size affects precision. It does not fix a sample drawn from the wrong population.")],
       "<p>The team sampled from active users but wants a number for all registered users. People who gave up on the app can't be in the sample, and they are the least satisfied group. This is selection bias, of the survivorship kind.</p>",
       "Cheatsheet page 3: Bias in data", module=1, minutes=3)

numeric("p3-logistic", "Logistic prediction",
        "<p>A logistic regression for churn has an intercept of -2.0 and a coefficient of 0.8 on the number of support tickets.</p>"
        "<p>What probability of churn does it predict for a customer with 3 tickets?" + ROUND + "</p>",
        1 / (1 + exp(-(-2.0 + 0.8 * 3))),
        r"<p>The linear part is \(z = -2.0 + 0.8 \times 3 = 0.4\).</p><p>\(p = \frac{1}{1 + e^{-0.4}} = \frac{1}{1.6703} = 0.599\)</p>"
        r"<p>Each extra ticket multiplies the odds by \(e^{0.8} = 2.23\). It does not add 0.8 to the probability.</p>",
        "Cheatsheet page 3: Logistic regression", minutes=5)

# ================================================================ probability: mock questions
numeric("m1-p1", "Two reviews",
        "<p>1% of accounts on a platform are fraudulent. Model A flags 95% of fraudulent accounts and 10% of legitimate ones. Every account that A flags goes to model B, which flags 80% of fraudulent accounts and 5% of legitimate ones. Given the true status of an account, the two models err independently.</p>"
        "<p>An account has been flagged by both models. What is the probability that it is fraudulent?" + ROUND + "</p>",
        0.01 * 0.95 * 0.80 / (0.01 * 0.95 * 0.80 + 0.99 * 0.10 * 0.05),
        r"<p>Compute the probability of a double flag for each kind of account.</p>"
        r"<p>Fraudulent and flagged twice: \(0.01 \times 0.95 \times 0.80 = 0.0076\). Legitimate and flagged twice: \(0.99 \times 0.10 \times 0.05 = 0.00495\).</p>"
        r"<p>\(\frac{0.0076}{0.0076 + 0.00495} = 0.606\)</p>"
        "<p>One flag alone gives only 0.088. The second review lifts it to 0.606.</p>",
        "Cheatsheet page 2: Bayes with counts", minutes=7)

numeric("m1-p2", "Sales calls",
        "<p>A sales rep makes 6 independent calls. Each call converts with probability 0.25.</p>"
        "<p>What is the probability of at least 2 conversions?" + ROUND + "</p>",
        1 - 0.75 ** 6 - 6 * 0.25 * 0.75 ** 5,
        r"<p>Subtract the two cases you don't want: zero conversions and exactly one.</p>"
        r"<p>\(P(0) = 0.75^{6} = 0.1780\) and \(P(1) = 6 \times 0.25 \times 0.75^{5} = 0.3560\).</p><p>\(1 - 0.1780 - 0.3560 = 0.466\)</p>",
        "Cheatsheet page 2: Distribution facts", minutes=5)

numeric("m2-p1", "Third box",
        "<p>A shelf holds 15 boxes, and 4 of them are mislabeled. An auditor checks boxes one at a time, at random and without replacement, and stops at the first mislabeled box.</p>"
        "<p>What is the probability that she checks exactly 3 boxes?" + ROUND + "</p>",
        (11 / 15) * (10 / 14) * (4 / 13),
        "<p>She checks exactly 3 boxes when the first two are fine and the third is mislabeled. The pool shrinks after each box.</p>"
        r"<p>\(\frac{11}{15} \times \frac{10}{14} \times \frac{4}{13} = \frac{440}{2730} = 0.161\)</p>",
        "Cheatsheet page 2: Worked examples (without replacement)", minutes=6)

numeric("m2-p2", "R squared by hand",
        "<p>A regression predicts 4, 4, 8, and 8 for four observations. The actual values are 3, 5, 7, and 9.</p>"
        "<p>What is R squared?" + ROUND + "</p>",
        1 - 4 / 20,
        r"<p>The mean of the actual values is 6, so \(\text{SST} = 9 + 1 + 1 + 9 = 20\).</p>"
        r"<p>Every error is 1 or -1, so \(\text{SSE} = 4\).</p><p>\(R^{2} = 1 - \frac{4}{20} = 0.800\)</p>",
        "Cheatsheet page 3: Linear regression", minutes=5)

# ================================================================ ML: set F1 (fit and regularization)
choice("f1-gap", "A wide gap",
       "<p>A gradient-boosted model scores an AUC of 0.99 on the training data and 0.71 on validation data from the same period.</p><p>Select every change that is likely to narrow the gap.</p>",
       [("Lower the learning rate and stop adding trees when the validation score stops improving.", True, "Early stopping halts training before the model memorizes noise."),
        ("Increase the maximum tree depth.", False, "Deeper trees add capacity, which widens the gap."),
        ("Raise the minimum number of samples per leaf.", True, "Larger leaves smooth the fit and reduce variance."),
        ("Train on more rows from the same distribution.", True, "More data reduces variance."),
        ("Add a one-hot column for every customer ID.", False, "ID columns let the model memorize rows, which worsens overfitting.")],
       "<p>A large gap between training and validation scores is overfitting, which is high variance. The fixes reduce capacity, regularize, or add data. Anything that adds capacity makes it worse.</p>",
       "Cheatsheet page 4: Diagnose the fit")

choice("f1-penalties", "L1 and L2",
       "<p>Select the true statements about L1 (lasso) and L2 (ridge) penalties in linear models.</p>",
       [("L1 can set coefficients to exactly zero.", True, "The corners of the L1 constraint make exact zeros common, which gives feature selection."),
        ("Ridge regression has a closed-form solution.", True, "The L2 penalty keeps the problem quadratic."),
        ("With two highly correlated features, L2 tends to share the weight between them and L1 tends to keep one.", True, "This is the standard contrast between the two penalties."),
        ("Increasing the penalty strength always lowers the validation error.", False, "Too much regularization underfits, and the validation error rises again."),
        ("Neither penalty is affected by the scale of the features.", False, "Both penalize coefficient size, and coefficient size depends on feature scale. Standardize first.")],
       "<p>L1 gives sparse models. L2 shrinks every coefficient smoothly and handles correlated features more stably. Both need standardized features, and both have a best strength that you find on validation data.</p>",
       "Cheatsheet page 4: Regularization")

choice("f1-c", "The C parameter",
       "<p>In scikit-learn's <code>LogisticRegression</code>, you change <code>C</code> from 1.0 to 0.01 and refit. What do you expect?</p>",
       [("Stronger regularization: the coefficients shrink toward zero.", True, "C is the inverse of the regularization strength."),
        ("Weaker regularization: the coefficients grow.", False, "That happens when C increases."),
        ("A smaller learning rate, so training takes longer.", False, "C has nothing to do with the optimizer's step size."),
        ("Higher weight on the minority class.", False, "That is class_weight."),
        ("No change unless the penalty is L1.", False, "C applies to the default L2 penalty too.")],
       "<p><code>C</code> is 1 divided by the regularization strength, so a smaller <code>C</code> means a stronger penalty. Ridge and Lasso use <code>alpha</code>, which works the other way round.</p>",
       "Cheatsheet page 4: Regularization")

choice("f1-loss", "Loss that climbs",
       "<p>The training loss of a neural network oscillates and trends upward from the first epoch.</p><p>Select the reasonable first fixes.</p>",
       [("Reduce the learning rate.", True, "Steps that are too large overshoot the minimum, so the loss climbs."),
        ("Standardize the input features.", True, "Features on very different scales make the loss surface steep in some directions, so a given step size diverges."),
        ("Clip the gradients.", True, "Clipping caps the size of each step."),
        ("Increase the learning rate.", False, "That makes the overshoot worse."),
        ("Add more hidden layers.", False, "More capacity does not fix an unstable optimizer.")],
       "<p>A training loss that rises means the optimizer is diverging, and the usual cause is a step size that is too large for the loss surface. Overfitting looks different: the training loss keeps falling while the validation loss rises.</p>",
       "Cheatsheet page 4: Diagnose the fit, Gradient descent")

choice("f1-bias", "Both errors high",
       "<p>A ridge regression has a high error on the training set and a similar error on the validation set.</p><p>Select what is likely to help.</p>",
       [("Add interaction or polynomial features.", True, "The model is too simple for the pattern, so give it more to work with."),
        ("Collect more training rows.", False, "More data lowers variance. This model's problem is bias."),
        ("Reduce the regularization strength.", True, "A weaker penalty lets the model fit more closely."),
        ("Switch to a more flexible model, such as gradient-boosted trees.", True, "A flexible model can capture non-linear effects."),
        ("Apply stronger L2 regularization.", False, "That constrains the model further and increases bias.")],
       "<p>High error on both sets, with a small gap, is underfitting. Add capacity or better features. More data and more regularization are cures for the opposite problem.</p>",
       "Cheatsheet page 4: Diagnose the fit")

# ================================================================ ML: set F2 (trees, ensembles, neighbors)
choice("f2-forest-boost", "Forest or boosting",
       "<p>Select the true statements that compare random forests with gradient boosting.</p>",
       [("A random forest's trees can be trained in parallel, and boosting builds its trees one after another.", True, "Each boosted tree depends on the errors of the ensemble so far."),
        ("Adding more trees to a random forest makes it overfit more.", False, "Averaging more trees lowers variance. The gains flatten, and the fit does not get worse."),
        ("Boosting usually uses shallow trees, and random forests usually use deep trees.", True, "Boosting combines weak learners. Bagging averages strong, high-variance ones."),
        ("Random forests mainly reduce variance, and boosting mainly reduces bias.", True, "That follows from averaging versus sequential error correction."),
        ("Gradient boosting is less sensitive to noisy labels than a random forest.", False, "Boosting keeps fitting the remaining errors, including noise, so it is more sensitive.")],
       "<p>Bagging averages many deep, decorrelated trees to cut variance. Boosting adds shallow trees that each correct the current errors, which cuts bias and can overfit if you add too many.</p>",
       "Cheatsheet page 4: Random forest vs gradient boosting")

choice("f2-tree", "Decision tree facts",
       "<p>Select the true statements about a single decision tree.</p>",
       [("Standardizing the features changes the tree's predictions.", False, "Splits depend on the order of values, and scaling keeps the order."),
        ("A fully grown tree can reach near-zero training error and usually overfits.", True, "It keeps splitting until the leaves are pure."),
        ("It can capture interactions between features without you adding them by hand.", True, "A split on one feature inside a branch of another is an interaction."),
        ("A small change in the training data can produce a very different tree.", True, "Trees are high-variance models, which is why ensembles help."),
        ("It extrapolates a linear trend beyond the range of the training data.", False, "A tree predicts a constant in each leaf, so it is flat outside the training range.")],
       "<p>Trees are scale-free, pick up non-linear effects and interactions, and are unstable. Control them with depth and leaf-size limits, or average many of them.</p>",
       "Cheatsheet page 4: Model families")

choice("f2-knn", "Choosing k",
       "<p>You tune k for a k-nearest neighbors classifier. With k = 1, training accuracy is 100% and validation accuracy is 78%. With k = 200, both are about 70%.</p><p>Which statement is correct?</p>",
       [("k = 1 overfits and k = 200 underfits. The best k is likely in between, and cross-validation finds it.", True, "Small k gives high variance, and large k gives high bias."),
        ("k = 1 underfits and k = 200 overfits.", False, "It is the other way round: k = 1 memorizes the training set."),
        ("Increasing k always improves validation accuracy.", False, "Past the best value, a larger k smooths away real structure."),
        ("k must equal the number of classes.", False, "k is the number of neighbors that vote."),
        ("k stops mattering once the features are scaled.", False, "Scaling fixes the distance. The bias-variance tradeoff in k remains.")],
       "<p>With k = 1 each training point is its own nearest neighbor, so training accuracy is perfect and the boundary follows noise. A very large k approaches predicting the majority class.</p>",
       "Cheatsheet page 4: Model families (Choosing k)")

choice("f2-ensembles", "How ensembles work",
       "<p>Select the true statements about ensemble methods.</p>",
       [("Bagging trains each model on a bootstrap sample of the rows.", True, "Bagging is short for bootstrap aggregating."),
        ("In boosting, each new model focuses on the errors of the current ensemble.", True, "It fits the residuals or reweights the misclassified rows."),
        ("Out-of-bag rows give a random forest a validation estimate without a separate holdout.", True, "Each tree is scored on the rows its bootstrap sample left out."),
        ("A random forest considers every feature at every split.", False, "It considers a random subset, which decorrelates the trees."),
        ("Stacking averages the base models with fixed, equal weights.", False, "Stacking trains a meta-model on out-of-fold predictions. Equal weights is plain averaging.")],
       "<p>Bagging and random feature subsets make trees differ so that averaging helps. Boosting is sequential. Stacking learns how to combine models.</p>",
       "Cheatsheet page 4: Random forest vs gradient boosting")

choice("f2-bayes", "Naive Bayes",
       "<p>Select the true statements about a naive Bayes classifier.</p>",
       [("It assumes the features are independent of each other given the class.", True, "That is the naive assumption."),
        ("Strongly correlated features make its probabilities overconfident.", True, "Correlated evidence is counted more than once."),
        ("A feature value never seen with a class gives a zero probability unless you apply smoothing.", True, "One zero factor wipes out the product. Laplace smoothing fixes it."),
        ("It needs feature scaling because it is distance-based.", False, "It multiplies per-feature likelihoods and uses no distances."),
        ("It can't be trained when there are more features than rows.", False, "Each feature is estimated on its own, so it copes well with many features, as in text.")],
       "<p>Naive Bayes applies Bayes' rule with a strong independence shortcut. It is fast and works with little data, but its probabilities are poorly calibrated when features overlap.</p>",
       "Cheatsheet page 4: Model families")

# ================================================================ ML: set F3 (metrics and validation)
choice("f3-threshold", "Raising the threshold",
       "<p>A churn classifier outputs probabilities. You raise the decision threshold from 0.5 to 0.8.</p><p>Select the statements that are guaranteed to hold.</p>",
       [("The number of predicted positives does not increase.", True, "Every row scored at 0.8 or more was already at 0.5 or more."),
        ("Recall does not increase.", True, "True positives can only stay or drop, and the number of actual positives is fixed."),
        ("Precision increases.", False, "It usually rises, but it is not guaranteed. It can fall if the rows you drop are mostly true positives."),
        ("ROC AUC stays the same.", True, "AUC is computed over all thresholds, from the scores alone."),
        ("The false positive rate does not increase.", True, "False positives can only stay or drop, and the number of actual negatives is fixed.")],
       "<p>A higher threshold predicts fewer positives. Recall and the false positive rate can only fall or stay. Precision usually rises, which is why you raise the threshold to hit a precision bar, but only \"usually\".</p>",
       "Cheatsheet page 5: Classification metrics")

choice("f3-auc", "Reading ROC AUC",
       "<p>Select the true statements about ROC AUC.</p>",
       [("It is the probability that a randomly chosen positive gets a higher score than a randomly chosen negative.", True, "This is the ranking interpretation."),
        ("It does not change if you apply a strictly increasing transformation to the scores.", True, "Only the order of the scores matters."),
        ("A model with an AUC of 0.5 ranks no better than chance.", True, "0.5 is the diagonal of the ROC plot."),
        ("It tells you which decision threshold to use.", False, "It summarizes all thresholds. You still choose one from costs or a target metric."),
        ("With 1% positives, a high ROC AUC guarantees high precision.", False, "With heavy imbalance, a small false positive rate still yields many false positives. Check the precision-recall curve.")],
       "<p>AUC measures ranking quality and ignores calibration and thresholds. Under heavy imbalance it can look strong while precision is poor.</p>",
       "Cheatsheet page 5: Classification metrics")

choice("f3-mse-mae", "MSE and MAE",
       "<p>Select the true statements about mean squared error and mean absolute error.</p>",
       [("The constant prediction that minimizes MSE is the mean, and for MAE it is the median.", True, "This is why MAE is robust to outliers."),
        ("MSE is more sensitive to outliers than MAE.", True, "Squaring makes large errors dominate."),
        ("On the same errors, RMSE is never smaller than MAE.", True, "They are equal only when every absolute error is the same size."),
        ("MAE is differentiable everywhere, which is why gradient methods prefer it.", False, "MAE has a kink at zero. MSE is the smooth one."),
        ("MSE and MAE always rank two models in the same order.", False, "A model with a few large misses can win on MAE and lose on MSE.")],
       "<p>Choose the metric that matches the cost of errors. If large misses are far worse than small ones, use squared error. If you want robustness to a few extreme values, use absolute error.</p>",
       "Cheatsheet page 5: Regression metrics")

choice("f3-imbalance", "Two percent fraud",
       "<p>2% of transactions are fraud. Select the sound practices.</p>",
       [("Report precision and recall, or PR AUC, instead of accuracy alone.", True, "Accuracy is dominated by the majority class."),
        ("Oversample the minority class, then split into train and test.", False, "Copies of the same row land on both sides of the split, which leaks."),
        ("Use a stratified split so that both sets keep the 2% rate.", True, "Otherwise a small test set can hold very few positives."),
        ("Apply class weights or resampling to the training folds only.", True, "Validation and test data must keep the real class balance."),
        ("Treat a model with 98% accuracy as clearly useful.", False, "Predicting \"not fraud\" for everything scores 98%.")],
       "<p>With rare positives, split first and keep the evaluation data untouched. Judge the model on metrics that focus on the positive class.</p>",
       "Cheatsheet page 5: Class imbalance")

choice("f3-cv", "Cross-validation",
       "<p>Select the true statements about cross-validation.</p>",
       [("In k-fold cross-validation, every row is used for validation exactly once.", True, "The folds partition the data."),
        ("Leave-one-out cross-validation trains one model per row.", True, "It is k-fold with k equal to the number of rows."),
        ("With time-ordered data, shuffled k-fold can leak future information into training.", True, "Use splits that train on the past and validate on the future."),
        ("Tune hyperparameters on the test set to get an unbiased final score.", False, "Tuning on the test set makes its score optimistic. Tune with cross-validation on the training data."),
        ("Stratified k-fold keeps all of one customer's rows in the same fold.", False, "That is group k-fold. Stratified k-fold keeps the class proportions.")],
       "<p>Cross-validation reuses the training data to estimate performance. The split must mirror how the model is used: grouped for repeated entities, ordered for time series, stratified for imbalanced classes.</p>",
       "Cheatsheet page 5: Validation")

# ================================================================ ML: set F4 (leakage, features, neural networks)
choice("f4-leak", "Find the leaks",
       "<p>Which of these leak information that the model would not have at prediction time? Select all that apply.</p>",
       [("Fitting a StandardScaler on the full dataset, then splitting into train and test.", True, "The scaler has seen the test rows."),
        ("Using \"refund issued\" as a feature to predict whether an order is returned.", True, "The refund happens after the return, so it encodes the target."),
        ("Computing target-encoding means on the training folds and applying them to the validation fold.", False, "That is the correct, out-of-fold way to do it."),
        ("Splitting rows at random when the same customer appears many times and the goal is to predict for new customers.", True, "The model sees the same customers in train and test. Split by customer."),
        ("Fitting an imputer inside a Pipeline that you pass to cross_val_score.", False, "The pipeline refits the imputer on each training fold, so nothing leaks.")],
       "<p>Leakage has three common forms: preprocessing fitted on all rows, features that come from the future or from the target, and splits that put the same entity on both sides.</p>",
       "Cheatsheet page 5: Data leakage")

choice("f4-scaling", "Who needs scaling",
       "<p>For which of these models does standardizing the features change the predictions? Select all that apply.</p>",
       [("k-nearest neighbors", True, "Distances are dominated by features with large scales."),
        ("Random forest", False, "Tree splits depend only on the order of values."),
        ("Logistic regression with an L2 penalty", True, "The penalty depends on coefficient size, which depends on feature scale."),
        ("Support vector machine with an RBF kernel", True, "The kernel is built on distances."),
        ("Ordinary least squares with no penalty", False, "The coefficients rescale to compensate, so the fitted values are identical.")],
       "<p>Scaling matters whenever the model uses distances or penalizes coefficients. Trees ignore it, and an unpenalized linear model absorbs it into the coefficients.</p>",
       "Cheatsheet page 5: Feature preparation")

choice("f4-encoding", "Encoding categories",
       "<p>Select the true statements about encoding categorical features.</p>",
       [("One-hot encoding an unordered category avoids implying an order.", True, "Each level gets its own column."),
        ("Ordinal encoding suits categories with a natural order, such as low, medium, high.", True, "The integers carry the order."),
        ("One-hot encoding a column with 50,000 distinct values creates a very wide, sparse matrix.", True, "Consider target encoding or grouping rare levels instead."),
        ("Encoding city names as the integers 0 to N is harmless for a linear model.", False, "The model would treat the codes as quantities, so city 40 counts as twice city 20."),
        ("With handle_unknown='ignore', OneHotEncoder raises an error on a category it did not see in training.", False, "It outputs zeros in every column of that feature.")],
       "<p>Match the encoding to the meaning: one-hot for names, ordinal for ranks. Plan for levels that appear only at prediction time.</p>",
       "Cheatsheet page 5: Feature preparation")

choice("f4-nn", "Neural network basics",
       "<p>Select the true statements about feed-forward neural networks.</p>",
       [("Without non-linear activations, a deep network is equivalent to a single linear layer.", True, "A composition of linear maps is linear."),
        ("ReLU reduces the vanishing-gradient problem compared with the sigmoid.", True, "Its gradient is 1 for positive inputs, and it does not saturate there."),
        ("Dropout is applied during training and switched off at prediction time.", True, "At prediction time the full network is used."),
        ("Starting with every weight at zero helps the network train faster.", False, "All units in a layer would compute the same thing and receive the same update."),
        ("The outputs of a softmax layer add up to 1.", True, "Softmax turns scores into a probability distribution over classes.")],
       "<p>Depth is only useful with non-linear activations. ReLU, sensible initialization, and normalization keep gradients healthy, and dropout regularizes during training.</p>",
       "Cheatsheet page 5: Neural network fundamentals")

choice("f4-output", "Output layer for two classes",
       "<p>You build a network for binary classification. Which output activation and loss are the standard pair?</p>",
       [("A sigmoid output with binary cross-entropy loss.", True, "The sigmoid gives a probability, and cross-entropy is its matching likelihood loss."),
        ("A softmax output over the two classes with mean squared error.", False, "Softmax pairs with cross-entropy, not squared error."),
        ("A ReLU output with cross-entropy loss.", False, "ReLU is unbounded above and can output exactly 0, so it is not a probability."),
        ("A linear output with hinge loss.", False, "That is the support vector machine setup, not the standard probabilistic classifier."),
        ("A tanh output with mean absolute error.", False, "tanh ranges from -1 to 1, which is not a probability.")],
       "<p>Regression uses a linear output with squared error. Binary classification uses a sigmoid with binary cross-entropy. Multi-class uses softmax with cross-entropy.</p>",
       "Cheatsheet page 5: Neural network fundamentals")

# ================================================================ ML: mock 1
choice("m1-f1", "Forest that memorizes",
       "<p>A random forest reaches 99% accuracy on the training set and 80% on the validation set.</p><p>Select every change that is likely to narrow the gap.</p>",
       [("Limit the maximum depth of the trees.", True, "Shallower trees can't isolate single rows."),
        ("Raise the minimum number of samples per leaf.", True, "Larger leaves average over more rows."),
        ("Train on all rows and stop using a validation set.", False, "That hides the gap. It does not close it."),
        ("Consider fewer features at each split.", True, "Trees become less correlated, so averaging removes more variance."),
        ("Stop standardizing the features.", False, "Scaling has no effect on trees.")],
       "<p>The forest's trees are too flexible. Constrain each tree, or decorrelate the trees so that averaging does more.</p>",
       "Cheatsheet page 4: Diagnose the fit")

choice("m1-f2", "Many irrelevant features",
       "<p>You have 5,000 features, most of them irrelevant, and you want a sparse linear model that is easy to explain. Which penalty fits best?</p>",
       [("L1 (lasso)", True, "It sets many coefficients to exactly zero."),
        ("L2 (ridge)", False, "It shrinks coefficients and keeps all of them non-zero."),
        ("No penalty", False, "With many irrelevant features, an unpenalized model overfits."),
        ("Dropout", False, "Dropout is a neural network regularizer."),
        ("Early stopping", False, "It limits training time and does not select features.")],
       "<p>L1 does feature selection as part of the fit. Elastic net is a common choice when correlated features make pure L1 unstable.</p>",
       "Cheatsheet page 4: Regularization")

choice("m1-f3", "Confusion matrix",
       "<p>On 1,000 cases a classifier has 30 true positives, 10 false positives, 20 false negatives, and 940 true negatives.</p><p>Select the correct values.</p>",
       [("Precision is 0.75.", True, "30 / (30 + 10)."),
        ("Recall is 0.60.", True, "30 / (30 + 20)."),
        ("Accuracy is 0.97.", True, "(30 + 940) / 1000."),
        ("F1 is 0.675.", False, "2 × 0.75 × 0.60 / 1.35 = 0.667. F1 is the harmonic mean, not the arithmetic mean."),
        ("The false positive rate is 0.25.", False, "10 / (10 + 940) = 0.0105. 0.25 is 1 minus precision.")],
       "<p>Precision divides by predicted positives. Recall divides by actual positives. The false positive rate divides by actual negatives.</p>",
       "Cheatsheet page 5: Classification metrics", minutes=3)

choice("m1-f4", "Boosting settings",
       "<p>Select the true statements about gradient boosting.</p>",
       [("A smaller learning rate usually needs more trees to reach the same training loss.", True, "Each tree contributes less."),
        ("Early stopping uses a validation set to choose the number of trees.", True, "You stop when the validation score stops improving."),
        ("Training each tree on a random subsample of rows can reduce overfitting.", True, "This is stochastic gradient boosting."),
        ("Deeper trees always generalize better.", False, "Deeper trees fit more complex interactions and overfit more easily."),
        ("Boosting can't overfit because each tree is a weak learner.", False, "Enough weak learners fit the noise.")],
       "<p>Learning rate, number of trees, and tree depth trade off against each other. The usual recipe is a small learning rate, shallow trees, and early stopping.</p>",
       "Cheatsheet page 4: Random forest vs gradient boosting")

choice("m1-f5", "Monthly snapshots",
       "<p>Your data has one row per customer per month. You predict next month's churn and evaluate with a random 80/20 split of the rows.</p><p>Select the real problems with this setup.</p>",
       [("The same customer appears in both train and test.", True, "The model can recognize customers instead of learning patterns that carry over to new ones."),
        ("Rows from later months can be in train while earlier months are in test.", True, "The model learns from the future."),
        ("The test score is likely too optimistic.", True, "Both leaks inflate it."),
        ("A random split is invalid for every classification task.", False, "It is fine when rows are independent and not time-ordered."),
        ("Stratifying the split by the target fixes these problems.", False, "Stratifying balances classes. It does not separate customers or time.")],
       "<p>Split the way the model is used: train on earlier months and test on later ones, and keep each customer on one side when you predict for new customers.</p>",
       "Cheatsheet page 5: Validation, Data leakage")

choice("m1-f6", "Hidden-layer activation",
       "<p>Which activation is the usual default for the hidden layers of a feed-forward network, and why?</p>",
       [("ReLU, because it is cheap to compute and does not saturate for positive inputs.", True, "Gradients pass through unchanged where the unit is active."),
        ("Sigmoid, because its outputs are probabilities.", False, "Sigmoids saturate, and gradients vanish in deep stacks."),
        ("Softmax, because it normalizes each layer.", False, "Softmax belongs on a multi-class output layer."),
        ("A linear activation, because it keeps gradients constant.", False, "Linear layers collapse into one linear map."),
        ("A step function, because it gives clear decisions.", False, "Its gradient is zero almost everywhere, so backpropagation can't train it.")],
       "<p>ReLU and its variants are the default for hidden layers. Sigmoid and softmax are for output layers.</p>",
       "Cheatsheet page 5: Neural network fundamentals")

# ================================================================ ML: mock 2
choice("m2-f1", "More ridge",
       "<p>You increase <code>alpha</code> in a Ridge regression from 0.1 to 100 and refit on the same data. Select what you expect.</p>",
       [("The coefficients shrink toward zero.", True, "A larger alpha is a stronger L2 penalty."),
        ("The training error stays the same or rises.", True, "A tighter constraint can't fit the training data better."),
        ("The model's variance decreases.", True, "Predictions depend less on the particular sample."),
        ("Some coefficients become exactly zero.", False, "That is the L1 penalty. L2 shrinks coefficients and leaves them non-zero."),
        ("The model's bias decreases.", False, "Bias increases as the model is constrained.")],
       "<p>Regularization trades variance for bias. In scikit-learn, <code>alpha</code> is the strength for Ridge and Lasso, and <code>C</code> is its inverse for logistic regression and SVMs.</p>",
       "Cheatsheet page 4: Regularization")

choice("m2-f2", "Nearest neighbors in practice",
       "<p>Select the true statements about k-nearest neighbors.</p>",
       [("The cost of a prediction grows with the size of the training set.", True, "Each prediction searches the stored training points."),
        ("Features with larger scales dominate the distance unless you scale them.", True, "Standardize before computing distances."),
        ("Performance tends to drop as you add irrelevant features.", True, "Noise dimensions drown out the useful distances."),
        ("Training is slow because the model fits many parameters.", False, "Training only stores the data. The work happens at prediction time."),
        ("A larger k makes the decision boundary more jagged.", False, "A larger k averages over more neighbors and smooths the boundary.")],
       "<p>k-NN is simple and has no training step, but it needs scaled, relevant features and gets slow and unreliable in high dimensions.</p>",
       "Cheatsheet page 4: Model families")

choice("m2-f3", "Rare disease screening",
       "<p>A screening model looks for a disease that affects 0.5% of patients. Missing a case is very costly, and a false alarm leads to a cheap follow-up test.</p><p>Which metric should guide your choice of threshold?</p>",
       [("Recall", True, "It measures the share of actual cases you catch, which is what the costs care about."),
        ("Accuracy", False, "Predicting \"healthy\" for everyone scores 99.5%."),
        ("Precision", False, "False alarms are cheap here, so precision is the secondary concern."),
        ("Specificity", False, "It measures how well you clear healthy patients, not how many cases you catch."),
        ("R squared", False, "That is a regression metric.")],
       "<p>When misses cost far more than false alarms, lower the threshold to raise recall, and accept more false positives as long as the follow-up stays affordable.</p>",
       "Cheatsheet page 5: Classification metrics")

choice("m2-f4", "Tuning and validation",
       "<p>Select the true statements about hyperparameter tuning.</p>",
       [("By default, GridSearchCV refits the best configuration on the whole training set.", True, "refit=True is the default, and best_estimator_ holds the refitted model."),
        ("Random search can cover a large space with fewer fits than a full grid.", True, "It samples configurations instead of trying every combination."),
        ("Nested cross-validation separates tuning from performance estimation.", True, "The inner loop tunes and the outer loop scores."),
        ("Picking the model with the best test-set score and reporting that score gives an unbiased estimate.", False, "Selecting on the test set makes its score optimistic."),
        ("10-fold cross-validation always gives a lower error estimate than 5-fold.", False, "More folds change the bias and variance of the estimate. They don't guarantee a lower number.")],
       "<p>Keep three roles apart: training data fits the model, validation folds choose the settings, and untouched test data reports the result once.</p>",
       "Cheatsheet page 5: Validation")

choice("m2-f5", "PCA",
       "<p>Select the true statements about principal component analysis.</p>",
       [("The principal components are uncorrelated with each other.", True, "They are orthogonal directions of variance."),
        ("PCA should be fitted on the training data only.", True, "Fitting on all rows leaks information from the test set."),
        ("PCA uses the target to find its directions.", False, "It is unsupervised and looks only at the features."),
        ("Features should usually be standardized before PCA.", True, "Otherwise the features with the largest scales dominate the components."),
        ("The first component explains the least variance.", False, "Components are ordered from most to least variance.")],
       "<p>PCA rotates the features onto directions of decreasing variance. Because it ignores the target, a low-variance direction it discards can still be predictive.</p>",
       "Cheatsheet page 4: Model families")

choice("m2-f6", "Reading coefficients",
       "<p>A logistic regression for churn has a coefficient of 0.7 on the number of support tickets and -0.03 on tenure in months.</p><p>Select the correct readings.</p>",
       [("Each extra ticket multiplies the odds of churn by about 2, holding tenure fixed.", True, "e to the power 0.7 is 2.01."),
        ("Each extra ticket raises the probability of churn by 0.7.", False, "Coefficients act on the log-odds, not on the probability."),
        ("Longer tenure is associated with lower odds of churn.", True, "The coefficient is negative."),
        ("The decision boundary is linear in the features.", True, "The log-odds are a linear function of the features."),
        ("Tickets matter more than tenure because 0.7 is larger than 0.03.", False, "The features have different units. Compare coefficients only after standardizing.")],
       "<p>Exponentiate a coefficient to get an odds ratio. To compare the size of effects, put the features on the same scale first.</p>",
       "Cheatsheet page 3: Logistic regression")

SETS = [
    dict(id="P1", module=1, title="Rules and Bayes", questions=["p1-flag", "p1-jobs", "p1-audit", "p1-suppliers", "p1-retry"]),
    dict(id="P2", module=1, title="Distributions and stages", questions=["p2-churn", "p2-signups", "p2-normal", "p2-redraw", "p2-converted"]),
    dict(id="P3", module=1, title="Statistics and regression", questions=["p3-interval", "p3-rmse", "p3-survey", "p3-logistic"]),
    dict(id="F1", module=2, title="Fit and regularization", questions=["f1-gap", "f1-penalties", "f1-c", "f1-loss", "f1-bias"]),
    dict(id="F2", module=2, title="Trees, ensembles, and neighbors", questions=["f2-forest-boost", "f2-tree", "f2-knn", "f2-ensembles", "f2-bayes"]),
    dict(id="F3", module=2, title="Metrics and validation", questions=["f3-threshold", "f3-auc", "f3-mse-mae", "f3-imbalance", "f3-cv"]),
    dict(id="F4", module=2, title="Leakage, features, and neural networks", questions=["f4-leak", "f4-scaling", "f4-encoding", "f4-nn", "f4-output"]),
]

MOCKS = [
    dict(id="m1", title="Mock test 1", story="Telecom churn", minutes=90,
         questions=["m1-p1", "m1-p2", "m1-f1", "m1-f2", "m1-f3", "m1-f4", "m1-f5", "m1-f6", "m1-collect", "m1-process", "m1-model"]),
    dict(id="m2", title="Mock test 2", story="Loan defaults", minutes=90,
         questions=["m2-p1", "m2-p2", "m2-f1", "m2-f2", "m2-f3", "m2-f4", "m2-f5", "m2-f6", "m2-collect", "m2-process", "m2-model"]),
]


def C(id, again=False):
    return dict(kind="code", id=id, again=again)


def S(id):
    return dict(kind="set", id=id)


PLAN = [
    dict(id="s1", title="Open-book run", goal="Meet all three coding question types once, with the cheatsheet open.",
         items=[C("houses-collect"), C("houses-process"), C("houses-model"), S("P1")]),
    dict(id="s2", title="Collection from memory", goal="Filter, aggregate, left-join, fix, save. Repeat until it is automatic.",
         items=[C("shop-top3"), C("shop-inactive"), C("shop-monthly"), C("shop-running"), S("F1")]),
    dict(id="s3", title="Processing and model templates", goal="Fit on train, transform both. Then clear a metric bar.",
         items=[C("cars-onehot"), C("cars-bins"), C("cars-scale"), C("fraud-precision"), S("F2")]),
    dict(id="s4", title="Mock test 1", goal="Ninety minutes, closed book, in one sitting.",
         items=[dict(kind="mock", id="m1"), dict(kind="todo", id="review-m1", text="Read the mock report and note your two weakest modules", minutes=10)]),
    dict(id="s5", title="Close the gaps", goal="File formats, cross-validation, and the questions you missed.",
         items=[C("shop-formats"), C("cv-report"), S("P2"), S("F3"), dict(kind="misses")]),
    dict(id="s6", title="Recall day", goal="Redo the first three tasks from a blank file, closed book.",
         items=[S("P3"), S("F4"), C("houses-collect", True), C("houses-process", True), C("houses-model", True)]),
    dict(id="s7", title="Mock test 2", goal="Test conditions: one sitting, no notes, no breaks.",
         items=[dict(kind="mock", id="m2"),
                dict(kind="todo", id="kit-check", text="Check your photo ID, camera, microphone, charger, and the rules on your invite", minutes=10)]),
    dict(id="s8", title="Test day", goal="Warm up for 15 minutes, then sit the test rested.",
         items=[C("shop-top3", True), dict(kind="misses"),
                dict(kind="todo", id="sit-test", text="Sit the test. Quiz first, capped at 25 minutes. Save a file before you improve it", minutes=90)]),
]

MATH = re.compile(r"\\\((.+?)\\\)", re.S)


def render(html):
    """Turn \\( ... \\) into MathML."""
    return MATH.sub(lambda m: l2m.convert(m.group(1).strip()), html)


def assemble(exercises):
    ids = [q["id"] for q in Q]
    assert len(ids) == len(set(ids)), "duplicate question id"
    ex_ids = {e["id"] for e in exercises}
    byid = {q["id"]: q for q in Q}
    # every numeric answer is the rounding of its exact value, and is stated in its explanation
    for q in Q:
        if q["type"] == "numeric":
            assert abs(float(q["answer"]) - q["exact"]) <= 0.5 * 10 ** -q["decimals"] + 1e-12, q["id"]
            shown = q["answer"].rstrip("0").rstrip(".")
            assert shown in q["explain"], f"{q['id']}: answer {q['answer']} not shown in the explanation"
        else:
            assert all(o["why"] for o in q["options"]), q["id"]
            if q["type"] == "single":
                assert sum(o["correct"] for o in q["options"]) == 1
    for s in SETS:
        assert all(i in byid and byid[i]["module"] == s["module"] for i in s["questions"]), s["id"]
    in_sets = {i for s in SETS for i in s["questions"]}
    in_mocks = {i for m in MOCKS for i in m["questions"]}
    assert not (in_sets & in_mocks), "a mock question is also in a practice set"
    assert in_sets | (in_mocks - ex_ids) == set(ids), f"unused questions: {set(ids) - in_sets - in_mocks}"
    for m in MOCKS:
        kinds = [byid[i]["module"] if i in byid else next(e["module"] for e in exercises if e["id"] == i) for i in m["questions"]]
        assert kinds == [1, 1, 2, 2, 2, 2, 2, 2, 3, 4, 5], (m["id"], kinds)
    for sess in PLAN:
        for it in sess["items"]:
            if it["kind"] == "code":
                assert it["id"] in ex_ids, it
            if it["kind"] == "set":
                assert it["id"] in {s["id"] for s in SETS}, it
    text = " ".join(str(v) for q in Q for v in (q["stem"], q["explain"], q["title"], q["ref"]) ) + " ".join(
        o["text"] + o["why"] for q in Q if "options" in q for o in q["options"]) + " ".join(
        e["desc"] + " ".join(e["hints"]) + e["title"] for e in exercises)
    for bad, name in (("–", "en dash"), ("—", "em dash"), ("!", "exclamation mark"), ("$", "dollar sign")):
        assert bad not in text, f"{name} found in content near: {text[max(0, text.index(bad) - 60):text.index(bad) + 20]!r}"
    questions = []
    for q in Q:
        q = dict(q)
        q["stem"] = render(q["stem"])
        q["explain"] = render(q["explain"])
        shown = q["stem"] + q["explain"] + "".join(o["text"] + o["why"] for o in q.get("options", []))
        assert "\\" not in shown, f"{q['id']}: a backslash is left in the text"
        questions.append(q)
    return dict(version=1, modules=MODULES, questions=questions, sets=SETS, mocks=MOCKS, plan=PLAN, exercises=exercises)
