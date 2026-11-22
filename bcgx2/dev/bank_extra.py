"""Harder quiz sets: multi-step probability and statistics, and machine learning cases with numbers to work through.

The first seven sets test one fact or one rule per question. These seven ask for a diagnosis, a decision, or a
calculation in a described situation, which is where quiz time goes on the day. bank.py calls register().
"""
from math import comb, sqrt

SETS = [
    dict(id="P4", module=1, level="harder", title="Conditional probability, harder cases",
         questions=["p4-twice", "p4-pipeline", "p4-both", "p4-inbox", "p4-collision"]),
    dict(id="P5", module=1, level="harder", title="Multi-stage games and spread",
         questions=["p5-reroll", "p5-series", "p5-transfer", "p5-spread", "p5-reject", "p5-mean"]),
    dict(id="P6", module=1, level="harder", title="Tests and experiments",
         questions=["p6-ztest", "p6-margin", "p6-many", "p6-pvalue", "p6-simpson"]),
    dict(id="F5", module=2, level="harder", title="Diagnose the model",
         questions=["f5-too-good", "f5-plateau", "f5-production", "f5-folds", "f5-calibration"]),
    dict(id="F6", module=2, level="harder", title="Metrics with numbers",
         questions=["f6-two-thresholds", "f6-cost", "f6-topk", "f6-averaging", "f6-logloss", "f6-regression"]),
    dict(id="F7", module=2, level="harder", title="Features and model choice",
         questions=["f7-cardinality", "f7-missing", "f7-collinear", "f7-importance", "f7-extrapolate", "f7-kmeans"]),
    dict(id="F8", module=2, level="harder", title="Validation and experiments",
         questions=["f8-time", "f8-aggregates", "f8-groups", "f8-tuning", "f8-online", "f8-early"]),
]

SEE = {
    "p4-twice": "prob-bayes", "p4-pipeline": "prob-rules", "p4-both": "prob-bayes", "p4-inbox": "prob-bayes", "p4-collision": "prob-rules",
    "p5-reroll": "prob-expectation", "p5-series": "prob-expectation", "p5-transfer": "prob-bayes", "p5-spread": "prob-expectation",
    "p5-reject": "prob-distributions", "p5-mean": "stats-normal",
    "p6-ztest": "stats-normal", "p6-margin": "stats-normal", "p6-many": "stats-normal", "p6-pvalue": "stats-normal", "p6-simpson": "stats-normal",
    "f5-too-good": "ml-validation", "f5-plateau": "ml-fit", "f5-production": "ml-validation", "f5-folds": "ml-validation", "f5-calibration": "ml-metrics",
    "f6-two-thresholds": "ml-metrics", "f6-cost": "ml-metrics", "f6-topk": "ml-metrics", "f6-averaging": "ml-metrics", "f6-logloss": "ml-metrics",
    "f6-regression": "ml-linear",
    "f7-cardinality": "ml-validation", "f7-missing": "ml-validation", "f7-collinear": "ml-linear", "f7-importance": "ml-trees",
    "f7-extrapolate": "ml-trees", "f7-kmeans": "ml-models",
    "f8-time": "ml-validation", "f8-aggregates": "ml-validation", "f8-groups": "ml-validation", "f8-tuning": "ml-validation",
    "f8-online": "ml-metrics", "f8-early": "ml-nn",
}


def register(numeric, choice, ROUND):
    # ============================================================ probability: set P4
    numeric("p4-twice", "Two positive tests",
            "<p>A condition affects 2% of the patients who are screened. A test detects 90% of true cases, and it gives a false positive for 5% of healthy patients. "
            "Repeated tests on one patient are independent, given whether the patient has the condition.</p>"
            "<p>A patient tests positive twice. What is the probability that the patient has the condition?" + ROUND + "</p>",
            0.02 * 0.9 ** 2 / (0.02 * 0.9 ** 2 + 0.98 * 0.05 ** 2),
            r"<p>Apply Bayes with the likelihood of two positives. Because the tests are independent given the true status, multiply within each branch.</p>"
            r"<p>Condition and two positives: \(0.02 \times 0.9^{2} = 0.0162\). Healthy and two positives: \(0.98 \times 0.05^{2} = 0.00245\).</p>"
            r"<p>\(\frac{0.0162}{0.0162 + 0.00245} = 0.869\)</p>"
            "<p>One positive test gives only 0.269, because healthy patients far outnumber cases. The second positive does most of the work.</p>",
            "Cheatsheet page 2: Bayes with counts")

    numeric("p4-pipeline", "Redundant replicas",
            "<p>A request succeeds only if the gateway works, at least one of two replicas works, and the database works. "
            "The gateway works with probability 0.95, each replica with probability 0.90, and the database with probability 0.98. All four parts fail independently.</p>"
            "<p>What is the probability that a request succeeds?" + ROUND + "</p>",
            0.95 * (1 - 0.1 ** 2) * 0.98,
            r"<p>Parts in a chain multiply. For the redundant pair, use the complement: the pair fails only if both replicas fail.</p>"
            r"<p>\(P(\text{pair works}) = 1 - 0.1^{2} = 0.99\), so \(P(\text{success}) = 0.95 \times 0.99 \times 0.98 = 0.922\).</p>"
            "<p>The gateway is now the weakest link. A third replica would add almost nothing.</p>",
            "Cheatsheet page 2: Core rules")

    numeric("p4-both", "Flagged by both rules",
            "<p>Two fraud rules run independently. Rule A flags 30% of transactions, and rule B flags 20%.</p>"
            "<p>A transaction was flagged by at least one rule. What is the probability that both rules flagged it?" + ROUND + "</p>",
            0.06 / (1 - 0.7 * 0.8),
            r"<p>Condition on the event you are told about. \(P(\text{both}) = 0.3 \times 0.2 = 0.06\), and \(P(\text{at least one}) = 1 - 0.7 \times 0.8 = 0.44\).</p>"
            r"<p>\(P(\text{both} \mid \text{at least one}) = \frac{0.06}{0.44} = 0.136\)</p>"
            "<p>The trap is to answer 0.06. That is the share of all transactions, not the share of flagged ones.</p>",
            "Cheatsheet page 2: Core rules")

    numeric("p4-inbox", "Spam that gets through",
            "<p>30% of incoming email is spam. A filter blocks 95% of spam, and it wrongly blocks 2% of legitimate email.</p>"
            "<p>An email reaches the inbox. What is the probability that it is spam?" + ROUND + "</p>",
            0.3 * 0.05 / (0.3 * 0.05 + 0.7 * 0.98),
            r"<p>The evidence here is a negative result, so use the miss rate and the pass rate.</p>"
            r"<p>Spam that passes: \(0.30 \times 0.05 = 0.015\). Legitimate email that passes: \(0.70 \times 0.98 = 0.686\).</p>"
            r"<p>\(\frac{0.015}{0.015 + 0.686} = 0.021\)</p>"
            "<p>With counts: of 1,000 emails, 15 spam and 686 legitimate emails reach the inbox. 15 / 701 = 0.021.</p>",
            "Cheatsheet page 2: Bayes with counts")

    numeric("p4-collision", "Shared bucket",
            "<p>A job assigns each of 5 records to one of 20 buckets, uniformly at random and independently of the other records.</p>"
            "<p>What is the probability that at least two records land in the same bucket?" + ROUND + "</p>",
            1 - 20 * 19 * 18 * 17 * 16 / 20 ** 5,
            r"<p>Use the complement: no collision means each record takes a bucket that is still free.</p>"
            r"<p>\(P(\text{no collision}) = \frac{20}{20} \times \frac{19}{20} \times \frac{18}{20} \times \frac{17}{20} \times \frac{16}{20} = 0.5814\), so \(P(\text{collision}) = 1 - 0.5814 = 0.419\).</p>"
            "<p>This is the birthday problem. Collisions arrive much sooner than intuition suggests: 5 records fill only a quarter of the buckets.</p>",
            "Cheatsheet page 2: Core rules")

    # ============================================================ probability: set P5
    numeric("p5-reroll", "One reroll",
            "<p>You roll a fair six-sided die. If it shows 1, 2, or 3, you must roll again, and the second roll is your result. Otherwise the first roll is your result.</p>"
            "<p>What is the expected value of your result?" + ROUND + "</p>",
            0.5 * 5 + 0.5 * 3.5,
            "<p>Split on what happens at the first roll, then average the two branches.</p>"
            r"<p>With probability 1/2 the first roll is 4, 5, or 6, with a mean of 5. With probability 1/2 you roll again, and a fresh roll has a mean of 3.5.</p>"
            r"<p>\(E = \tfrac{1}{2} \times 5 + \tfrac{1}{2} \times 3.5 = 4.25\)</p>",
            "Cheatsheet page 2: Worked examples (multi-stage game)")

    numeric("p5-series", "Best of five",
            "<p>Two teams play a best-of-five series: the first team to win 3 games wins the series. Team A wins each game with probability 0.6, independently of the other games.</p>"
            "<p>What is the probability that team A wins the series?" + ROUND + "</p>",
            sum(comb(2 + k, k) * 0.6 ** 3 * 0.4 ** k for k in range(3)),
            "<p>Team A can win in 3, 4, or 5 games. In each case A wins the last game, and the losses fall anywhere before it.</p>"
            r"<p>\(0.6^{3}\left(1 + \binom{3}{1} 0.4 + \binom{4}{2} 0.4^{2}\right) = 0.216 \times (1 + 1.2 + 0.96) = 0.683\)</p>"
            "<p>A shortcut gives the same number: imagine all 5 games are played, and ask for at least 3 wins out of 5.</p>",
            "Cheatsheet page 2: Worked examples (multi-stage game)")

    numeric("p5-transfer", "Moved ball",
            "<p>Bag A holds 3 red balls and 2 blue balls. Bag B holds 1 red ball and 4 blue balls. One ball is moved at random from bag A to bag B. Then one ball is drawn at random from bag B.</p>"
            "<p>The ball drawn from bag B is red. What is the probability that the ball that was moved was red?" + ROUND + "</p>",
            (3 / 5 * 2 / 6) / (3 / 5 * 2 / 6 + 2 / 5 * 1 / 6),
            "<p>Two stages, then Bayes on the first stage.</p>"
            r"<p>Moved red, then drew red: \(\frac{3}{5} \times \frac{2}{6} = \frac{6}{30}\). Moved blue, then drew red: \(\frac{2}{5} \times \frac{1}{6} = \frac{2}{30}\).</p>"
            r"<p>\(P(\text{moved red} \mid \text{drew red}) = \frac{6}{6 + 2} = 0.75\)</p>",
            "Cheatsheet page 2: Worked examples (multi-stage game)")

    numeric("p5-spread", "Spread of a payout",
            "<p>A promotion pays a customer 10 with probability 0.2, pays 2 with probability 0.5, and pays nothing otherwise.</p>"
            "<p>What is the standard deviation of the payout?" + ROUND + "</p>",
            sqrt(0.2 * 100 + 0.5 * 4 - 3 ** 2),
            r"<p>Use \(\mathrm{Var}(X) = E[X^{2}] - (E[X])^{2}\).</p>"
            r"<p>\(E[X] = 0.2 \times 10 + 0.5 \times 2 = 3\) and \(E[X^{2}] = 0.2 \times 100 + 0.5 \times 4 = 22\), so the variance is \(22 - 9 = 13\).</p>"
            r"<p>The standard deviation is \(\sqrt{13} = 3.606\).</p>"
            "<p>The question asks for the standard deviation. Answering 13 is the common slip.</p>",
            "Cheatsheet page 2: Expectation and variance")

    numeric("p5-reject", "Batch rejected",
            "<p>A batch holds 30 items, and 6 of them are defective. An inspector samples 5 items at random, without replacement, and rejects the batch if 2 or more of them are defective.</p>"
            "<p>What is the probability that the batch is rejected?" + ROUND + "</p>",
            1 - (comb(24, 5) + 6 * comb(24, 4)) / comb(30, 5),
            "<p>Sampling without replacement is hypergeometric. Take the complement of 0 or 1 defective items.</p>"
            r"<p>\(P(0) = \frac{\binom{24}{5}}{\binom{30}{5}} = \frac{42504}{142506} = 0.2983\) and \(P(1) = \frac{6 \binom{24}{4}}{\binom{30}{5}} = \frac{63756}{142506} = 0.4474\).</p>"
            r"<p>\(P(\text{reject}) = 1 - 0.2983 - 0.4474 = 0.254\)</p>",
            "Cheatsheet page 2: Worked examples (without replacement)")

    choice("p5-mean", "Mean of 100 orders",
           "<p>Order values have a mean of 50 and a standard deviation of 20, with a long right tail. You take a random sample of 100 orders.</p>"
           "<p>About what is the probability that the sample mean is above 54?</p>",
           [("About 0.16", False, "That is one standard error above the mean, which is 52."),
            ("About 0.025", True, "The standard error is 20 / 10 = 2, so 54 is 2 standard errors above the mean."),
            ("About 0.05", False, "That is the share outside 2 standard errors on both sides. The question asks about one side."),
            ("About 0.42", False, "That uses the standard deviation of one order, 20, in place of the standard error of the mean."),
            ("It can't be estimated, because order values are not normal.", False, "The central limit theorem makes the mean of 100 orders close to normal.")],
           r"<p>The sample mean has a standard error of \(\frac{20}{\sqrt{100}} = 2\). So 54 sits at z = 2, and about 2.5% of a normal curve lies above z = 2.</p>"
           "<p>The skew in single orders doesn't matter much at n = 100: the central limit theorem applies to the mean.</p>",
           "Cheatsheet page 3: Sampling, Confidence intervals", module=1, minutes=4)

    # ============================================================ statistics: set P6
    numeric("p6-ztest", "A/B test statistic",
            "<p>An A/B test shows the control page to 2,000 visitors, and 180 of them convert. It shows the variant to 2,000 visitors, and 220 of them convert.</p>"
            "<p>Using the pooled conversion rate for the standard error, what is the z statistic for the difference between the two conversion rates?" + ROUND + "</p>",
            0.02 / sqrt(0.1 * 0.9 * (2 / 2000)),
            r"<p>The rates are 0.09 and 0.11, and the pooled rate is \(\frac{180 + 220}{4000} = 0.10\).</p>"
            r"<p>\(SE = \sqrt{0.10 \times 0.90 \times \left(\frac{1}{2000} + \frac{1}{2000}\right)} = 0.009487\)</p>"
            r"<p>\(z = \frac{0.11 - 0.09}{0.009487} = 2.108\)</p>"
            "<p>That is above 1.96, so the difference is significant at the 5% level in a two-sided test. It is below 2.576, so it is not significant at the 1% level.</p>",
            "Cheatsheet page 3: Sampling, Confidence intervals")

    numeric("p6-margin", "Margin of error",
            "<p>A poll of 2,100 randomly chosen customers finds that 30% prefer the new plan.</p>"
            "<p>Using z = 1.96, what is the margin of error of the 95% confidence interval for that share?" + ROUND + "</p>",
            1.96 * sqrt(0.3 * 0.7 / 2100),
            r"<p>The standard error of a share is \(\sqrt{\frac{p(1-p)}{n}} = \sqrt{\frac{0.3 \times 0.7}{2100}} = 0.01\).</p>"
            r"<p>The margin of error is \(1.96 \times 0.01 = 0.0196\), which rounds to 0.020. The interval runs from about 28% to 32%.</p>"
            "<p>To halve the margin you need four times the sample, because the sample size sits under a square root.</p>",
            "Cheatsheet page 3: Sampling, Confidence intervals")

    numeric("p6-many", "Twenty metrics",
            "<p>A team checks 20 independent metrics in an A/B test, each at the 5% significance level. In truth the variant changes none of them.</p>"
            "<p>What is the probability that at least one metric comes out significant?" + ROUND + "</p>",
            1 - 0.95 ** 20,
            r"<p>Each test stays quiet with probability 0.95, so \(P(\text{at least one false positive}) = 1 - 0.95^{20} = 0.642\).</p>"
            "<p>With 20 looks, a false alarm is more likely than not. Pick one primary metric in advance, or correct the threshold: Bonferroni would test each metric at 0.05 / 20 = 0.0025.</p>",
            "Cheatsheet page 3: Sampling, Confidence intervals")

    choice("p6-pvalue", "Reading a p-value",
           "<p>An A/B test of a new checkout page gives a p-value of 0.03 for the difference in conversion. The team set a 5% significance level before the test.</p>"
           "<p>Select the correct statements.</p>",
           [("If the pages truly converted equally, a difference at least this large would appear about 3% of the time.", True, "That is the definition of the p-value."),
            ("There is a 97% probability that the new page is better.", False, "A p-value is computed assuming no difference. It is not the probability that a hypothesis is true."),
            ("The result is significant at the 5% level and not at the 1% level.", True, "0.03 is below 0.05 and above 0.01."),
            ("The p-value doesn't tell you how large the improvement is.", True, "A tiny effect can be significant with a large sample. Report the difference and its confidence interval."),
            ("If the team had checked the p-value every day and stopped at the first value below 0.05, the false positive rate would still be 5%.", False, "Repeated looks give chance more opportunities to cross the line, so the false positive rate rises.")],
           "<p>A p-value answers one question: how surprising is this data if nothing changed? It says nothing about the size of the effect, and its 5% guarantee holds only for the analysis you planned in advance.</p>",
           "Cheatsheet page 3: Sampling, Confidence intervals", module=1, minutes=3)

    choice("p6-simpson", "Two segments",
           "<p>A test compares pages A and B. Among new users, A converts 20 of 200 and B converts 90 of 800. Among returning users, A converts 240 of 800 and B converts 64 of 200. "
           "Overall, A converts 260 of 1,000 and B converts 154 of 1,000.</p><p>Which conclusion is sound?</p>",
           [("B converts better in both segments. A looks better overall only because most of its traffic was returning users, so the two groups were not comparable.", True,
             "B wins 11.25% to 10% and 32% to 30%. Returning users convert about three times as often, and A got 800 of them."),
            ("A is better, because the overall comparison uses the most data.", False, "The overall numbers mix two very different audiences in different proportions."),
            ("The segment results must contain an arithmetic error, because a page can't win both segments and lose overall.", False, "It can. This reversal is Simpson's paradox."),
            ("The pages are equivalent, because the two views disagree.", False, "The views disagree for a known reason: the traffic mix. Within each segment, B is ahead."),
            ("B is better only for returning users.", False, "B is ahead for new users too: 11.25% against 10%.")],
           "<p>When group sizes differ between the arms, a lurking variable can reverse the pooled result. Here that variable is user type.</p>"
           "<p>The deeper problem is the uneven assignment. A properly randomized test would give both pages the same mix of new and returning users.</p>",
           "Cheatsheet page 3: Bias in data", module=1, minutes=4)

    # ============================================================ ML: set F5
    choice("f5-too-good", "A score that is too good",
           "<p>A churn model reaches a validation AUC of 0.998. Its most important feature is <code>days_since_cancellation_request</code>.</p>"
           "<p>Select the sensible next steps.</p>",
           [("Check whether that feature is known at the moment you would make the prediction.", True, "A cancellation request arrives after the customer has decided to leave. It encodes the answer."),
            ("Remove the feature, retrain, and compare the scores.", True, "A large drop confirms that the feature carried the label."),
            ("Ship the model, because the validation rows were held out.", False, "A held-out split doesn't protect against a feature that leaks the target. The leak is in both parts."),
            ("Check whether the same customers appear in both the training and the validation rows.", True, "Duplicated entities are the other common cause of a score this high."),
            ("Add more trees to push the score to 1.0.", False, "The score is already suspicious. More capacity only fits the leak more closely.")],
           "<p>Treat a near-perfect score as a bug report. Ask of each top feature: would I have this value, in this form, at prediction time?</p>",
           "Cheatsheet page 5: Data leakage", minutes=3)

    choice("f5-plateau", "Curves that level off",
           "<p>A linear model predicts delivery time. As the training set grows from 10,000 to 200,000 rows, the training error and the validation error both level off at about 9 minutes. The business needs 5 minutes.</p>"
           "<p>Which step is most likely to help?</p>",
           [("Add informative features, or switch to a more flexible model.", True, "Both curves have converged at a high error. That is high bias: the model can't express the pattern."),
            ("Collect another 200,000 rows of the same kind.", False, "The curves are flat and close together, so more rows change little."),
            ("Increase the regularization strength.", False, "That constrains the model further and raises the bias."),
            ("Use 10-fold cross-validation in place of 5-fold.", False, "That changes how you measure the error, not the error."),
            ("Remove features until the two errors match exactly.", False, "They nearly match already. Fewer features raise the bias.")],
           "<p>Read learning curves by their gap and their level. A small gap at a high error is underfitting, and data volume won't fix it. A large gap is overfitting, and more data or more regularization helps.</p>",
           "Cheatsheet page 4: Diagnose the fit", minutes=3)

    choice("f5-production", "Worse in production",
           "<p>A credit model was trained on 2023 applications and scored an AUC of 0.86 on a held-out 2023 test set. On 2025 applications in production, its AUC is 0.71.</p>"
           "<p>Select the plausible explanations that are worth checking.</p>",
           [("The applicant population changed, so the feature distributions differ from 2023.", True, "Compare the distribution of each feature between the training data and recent data."),
            ("The relationship between the features and default changed, for example after a change in interest rates.", True, "That is concept drift. Only recent labels reveal it."),
            ("A feature is computed differently in the production pipeline than in the training pipeline.", True, "Training-serving skew is common. Compare feature values for the same applicants in both pipelines."),
            ("The 2023 test set was too large, which inflated the AUC.", False, "A larger test set makes the estimate more precise. It doesn't bias it upward."),
            ("The model used a different random seed in production.", False, "A fitted model has no seed at prediction time. Its outputs are fixed.")],
           "<p>A random split of one period only tells you how the model does on more data from that period. For a model that will run in the future, also validate on the most recent months, and monitor inputs and outcomes after launch.</p>",
           "Cheatsheet page 5: Validation", minutes=3)

    choice("f5-folds", "One bad fold",
           "<p>A 5-fold cross-validation returns accuracies of 0.91, 0.62, 0.90, 0.89, and 0.92.</p>"
           "<p>Select the sound responses.</p>",
           [("Look at what is different about the rows in the second fold.", True, "One fold far from the others often holds a distinct group, period, or data error."),
            ("Report the spread of the folds together with the mean.", True, "A mean of 0.848 hides the fact that one fold in five fails."),
            ("Drop the second fold and report the mean of the other four.", False, "That discards the evidence that the model fails on some of the data."),
            ("Consider a grouped or stratified split if the rows cluster by customer, site, or class.", True, "If one group lands in a single fold, the split is measuring how well the model handles an unseen group."),
            ("Report 0.92, because it shows what the model can do.", False, "Picking the best fold is selection on the validation data. It overstates performance.")],
           "<p>The variation between folds is information. A stable model has folds that agree. An outlier fold points to structure in the data that the split or the model ignores.</p>",
           "Cheatsheet page 5: Validation", minutes=3)

    choice("f5-calibration", "Probabilities that run high",
           "<p>A fraud model was trained on data in which legitimate transactions were undersampled. It ranks well, with an AUC of 0.90. Its predicted probabilities average 0.30, and the true fraud rate is 0.10.</p>"
           "<p>Select the true statements.</p>",
           [("The ranking metrics are still valid, but the probabilities need recalibration before you use them in an expected-cost calculation.", True, "Undersampling shifts the probabilities upward without changing the order much."),
            ("Fitting Platt scaling or isotonic regression on held-out data with the true class ratio can correct the probabilities.", True, "Both learn a mapping from the model's scores to observed frequencies."),
            ("A predicted probability of 0.5 still means a 50% chance of fraud.", False, "The probabilities are inflated. A score of 0.5 corresponds to a much lower real rate."),
            ("Recalibrating with a strictly increasing mapping will raise the AUC.", False, "AUC depends only on the order of the scores, and that mapping keeps the order."),
            ("A threshold chosen on the undersampled data may not give the same precision on real traffic.", True, "Precision depends on the class ratio, so choose the threshold on data with the real ratio.")],
           "<p>Ranking and calibration are separate qualities. AUC measures ranking only. When a decision multiplies a probability by a cost, the probability itself has to be right.</p>",
           "Cheatsheet page 5: Class imbalance", minutes=3)

    # ============================================================ ML: set F6
    two = ("<p>A fraud team compares two thresholds on 1,000 validation cases, 100 of which are fraud. At a threshold of 0.5, the model has 60 true positives, 20 false positives, and 40 false negatives. "
           "At a threshold of 0.3, it has 85 true positives, 85 false positives, and 15 false negatives.</p>")
    choice("f6-two-thresholds", "Two thresholds",
           two + "<p>Select the correct statements.</p>",
           [("Precision at 0.5 is 0.75.", True, "60 / (60 + 20)."),
            ("Recall at 0.3 is 0.85.", True, "85 / (85 + 15)."),
            ("The F1 score is higher at 0.3 than at 0.5.", False, "F1 is 0.667 at 0.5 and 0.630 at 0.3. The precision lost outweighs the recall gained."),
            ("Accuracy is higher at 0.3 than at 0.5.", False, "Accuracy is 0.94 at 0.5 and 0.90 at 0.3, because 65 more legitimate cases are flagged."),
            ("The false positive rate at 0.3 is about 0.094.", True, "85 false positives out of 900 legitimate cases.")],
           "<p>Write the four counts for each threshold first: at 0.5 the true negatives are 880, and at 0.3 they are 815. Then every metric is one division.</p>"
           "<p>Lowering the threshold raised recall from 0.60 to 0.85 and cut precision from 0.75 to 0.50. Whether that is a good trade depends on the costs.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=4)

    choice("f6-cost", "Cost of each threshold",
           two + "<p>A missed fraud costs 500, and a false alarm costs 20, in the same currency. Which threshold has the lower total cost?</p>",
           [("0.3, with a total cost of 9,200.", True, "15 × 500 + 85 × 20 = 9,200, against 20,400 at 0.5."),
            ("0.5, with a total cost of 20,400.", False, "That is the cost at 0.5, and it is the higher one: 40 × 500 + 20 × 20."),
            ("0.5, because its precision is higher.", False, "Precision ignores that a miss costs 25 times as much as a false alarm."),
            ("0.5, because its F1 score is higher.", False, "F1 weighs precision and recall equally. These costs don't."),
            ("They cost the same, because the model and its AUC are the same.", False, "AUC describes the ranking. The cost depends on where you cut it.")],
           "<p>When you know the costs, compute the total for each threshold and take the lowest. A metric such as F1 is a stand-in for when you don't know them.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=3)

    choice("f6-topk", "Top of the list",
           "<p>A bank can call 1,000 of its 100,000 customers. 2% of all customers would accept the offer. Among the 1,000 customers that the model scores highest, 18% accept.</p>"
           "<p>Which statement is correct?</p>",
           [("The lift in the top 1% is 9: about 180 acceptances, where random calling would give about 20.", True, "18% against a base rate of 2%."),
            ("Recall is 18%, because 18% of the called customers accept.", False, "18% is the precision in the top 1,000. Recall is 180 of 2,000 acceptors, which is 9%."),
            ("The model is weak, because it finds fewer than 10% of all acceptors.", False, "Calling 1% of customers at random finds 1% of acceptors. Finding 9% is nine times better."),
            ("Accuracy in the top 1,000 is what the campaign should be judged on.", False, "The campaign cares how many of the called customers accept, which is precision at 1,000."),
            ("Calling the next 1,000 customers on the list would also give about 180 acceptances.", False, "Scores fall as you move down the list, and so does the acceptance rate.")],
           "<p>When capacity is fixed, judge the model on the part of the ranking you will act on: precision at k and lift. Lift is the precision in the selected group divided by the base rate.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=3)

    choice("f6-averaging", "Three classes",
           "<p>A classifier labels support tickets. On the test set, class A has 900 tickets with a recall of 0.95, class B has 80 tickets with a recall of 0.50, and class C has 20 tickets with a recall of 0.10.</p>"
           "<p>Select the true statements.</p>",
           [("Accuracy is about 0.90.", True, "855 + 40 + 2 = 897 correct out of 1,000."),
            ("Macro-averaged recall is about 0.52.", True, "(0.95 + 0.50 + 0.10) / 3."),
            ("Weighted-average recall is about 0.52.", False, "Weighting by class size gives 0.897, the same as accuracy."),
            ("Macro averaging gives every ticket the same weight.", False, "It gives every class the same weight, so a small class counts as much as a large one."),
            ("To show that the model fails on the rare classes, report macro recall or the per-class values.", True, "Accuracy and weighted averages are dominated by class A.")],
           "<p>The same model scores 0.90 or 0.52 depending on the average. Choose the average that matches what matters: macro if every class matters equally, weighted or accuracy if every row does.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=3)

    choice("f6-logloss", "Confidently wrong",
           "<p>A case has a true label of 1. Model A predicts 0.60 for it, model B predicts 0.90, and model C predicts 0.01. The metric is log loss.</p>"
           "<p>Select the true statements.</p>",
           [("Model B has the lowest loss on this case.", True, "The loss is the negative log of the probability given to the true class: 0.105 for B."),
            ("Model C's loss on this case is about 4.6.", True, "The negative natural log of 0.01 is 4.6, nine times model A's 0.51."),
            ("Log loss can't be greater than 1.", False, "It is unbounded. It grows without limit as the probability of the true class approaches 0."),
            ("A model can have the higher accuracy of two models and still have the worse log loss.", True, "A few confident mistakes cost more than many cautious correct answers gain."),
            ("Log loss depends only on how the model ranks the cases.", False, "It depends on the probability values. Rescaling them changes the loss even when the order stays the same.")],
           "<p>Log loss rewards calibrated confidence. One prediction of 0.01 for a true positive costs as much as about 44 predictions of 0.90, which is why clipping extreme probabilities is common.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=3)

    choice("f6-regression", "Scoring a forecast",
           "<p>A team forecasts daily demand for 500 products. Many products sell zero units on some days, and a few days have very large spikes.</p>"
           "<p>Select the true statements about how to score the forecast.</p>",
           [("MAPE is undefined on the days when actual demand is zero.", True, "It divides each error by the actual value."),
            ("RMSE gives the spike days more influence than MAE does.", True, "Squaring makes the large errors dominate."),
            ("R squared on the test set can be negative.", True, "That happens when the model does worse than predicting the mean of the test values."),
            ("MAE is expressed in squared units.", False, "MAE is in the units of the target. MSE is in squared units."),
            ("A lower RMSE on the training data shows that one model forecasts better than another.", False, "Training error rewards overfitting. Compare the models on held-out periods.")],
           "<p>Match the metric to the cost of an error. If a large miss is much worse than several small ones, use RMSE. If every unit of error costs the same, use MAE. Avoid percentage errors when the target can be zero.</p>",
           "Cheatsheet page 5: Regression metrics", minutes=3)

    # ============================================================ ML: set F7
    choice("f7-cardinality", "Forty thousand merchants",
           "<p>A fraud data set has 2 million rows and a <code>merchant_id</code> column with 40,000 distinct values. You plan to train gradient-boosted trees.</p>"
           "<p>Select the reasonable ways to use the column.</p>",
           [("Target encoding, with each row's value computed from other folds of the training data.", True, "Out-of-fold means keep a row's own label out of its feature."),
            ("Frequency encoding: replace each merchant with its number of transactions in the training data.", True, "It is cheap, has no label leak, and carries real signal."),
            ("Group merchants with few transactions into one \"other\" level before encoding.", True, "Rare levels give noisy estimates."),
            ("Target encoding computed on all rows, test rows included, so that every merchant gets a stable value.", False, "That puts test labels into a feature. The score will be optimistic."),
            ("Assign the integers 0 to 39,999 in arbitrary order, and feed them to a linear model as one numeric feature.", False, "A linear model would read the arbitrary numbers as an order and a distance.")],
           "<p>One-hot encoding 40,000 levels gives a very wide, sparse matrix. The usual alternatives compress each level to one or two numbers, and the one rule is that anything computed from the target stays inside the training folds.</p>",
           "Cheatsheet page 5: Feature preparation", minutes=3)

    choice("f7-missing", "Income left blank",
           "<p>In loan applications, <code>income</code> is missing for 30% of applicants, and it is missing much more often for self-employed applicants.</p>"
           "<p>Select the sound choices.</p>",
           [("Add a column that marks whether income was missing.", True, "The missingness is related to the applicant type, so it carries signal."),
            ("Impute with the training median, inside a pipeline that is fitted on the training data only.", True, "The median is robust to skew, and the pipeline keeps test data out of the statistic."),
            ("Drop every row with a missing income.", False, "That loses 30% of the data and removes mostly self-employed applicants, which biases the model."),
            ("Impute with the mean of the training and test rows together, to use all the data.", False, "That leaks test information into training."),
            ("Use a model that handles missing values itself, such as HistGradientBoostingClassifier.", True, "It learns which side of each split missing values should go to.")],
           "<p>First ask why a value is missing. When missingness depends on who the applicant is, dropping rows distorts the sample, and the fact that a value is missing is itself a feature.</p>",
           "Cheatsheet page 5: Feature preparation", minutes=3)

    choice("f7-collinear", "Two features that move together",
           "<p>A linear regression for house prices includes floor area and number of rooms. The two features have a correlation of 0.98.</p>"
           "<p>Select the true statements.</p>",
           [("The two coefficients are unstable: a small change in the data can move them a lot, and even flip a sign.", True, "The data can't separate the two effects, so their standard errors are large."),
            ("Predictions for homes like those in the training data can still be accurate.", True, "The combined effect is well estimated, even though the split between the two features is not."),
            ("Adding the second feature must lower R squared on the training set.", False, "Training R squared never falls when you add a feature to an ordinary least squares model."),
            ("Ridge regression can stabilize the coefficients.", True, "The L2 penalty shares the weight between correlated features."),
            ("Each coefficient is still a reliable measure of that feature's own effect on price.", False, "With features this correlated, the individual coefficients are not trustworthy.")],
           "<p>Multicollinearity hurts interpretation more than prediction. If you need to read the coefficients, drop or combine one of the features, or regularize.</p>",
           "Cheatsheet page 3: Linear regression", minutes=3)

    choice("f7-importance", "An important random column",
           "<p>A random forest's built-in feature importances rank <code>application_number</code>, an arbitrary unique number per row, among the top features.</p>"
           "<p>Select the true statements.</p>",
           [("Impurity-based importance favors features with many distinct values, because they offer many possible splits.", True, "A unique number lets deep trees isolate single rows."),
            ("Permutation importance measured on validation data is a better check.", True, "Shuffling a feature that only helped memorize training rows doesn't hurt validation performance."),
            ("When two features are strongly correlated, they can share importance, so each looks weaker than it is.", True, "The trees split on either one, and permuting one leaves the other to carry the signal."),
            ("A high importance shows that changing the feature would change the outcome.", False, "Importance describes what the model uses. It is not evidence of a causal effect."),
            ("The ranking means that the column should stay in the model.", False, "An arbitrary row identifier can't generalize. Remove it.")],
           "<p>Built-in importances are computed from the training data, so they reward anything that helps fit it, noise included. Confirm on held-out data before you act on a ranking.</p>",
           "Cheatsheet page 4: Random forest vs gradient boosting", minutes=3)

    choice("f7-extrapolate", "Larger than anything seen",
           "<p>A price model is trained on homes of 40 to 200 square meters. Price rises with size across that range. You then score homes of 350 square meters with a gradient-boosted tree model and with a linear regression.</p>"
           "<p>What should you expect?</p>",
           [("The tree model predicts about the same price as for the largest homes it saw, and the linear model keeps extending its slope.", True,
             "Every size above the last split threshold falls in the same leaves."),
            ("Both models extend the trend, because both were fitted on the size feature.", False, "Trees predict constants within leaves. They have no slope to extend."),
            ("The tree model extends the trend more steeply, because boosting adds up many trees.", False, "A sum of piecewise-constant trees is still constant beyond the training range."),
            ("The linear model's predictions flatten, because its coefficient was fitted on smaller homes.", False, "A linear model applies the same coefficient at any size."),
            ("Neither model can return a prediction outside the training range.", False, "Both return a number. The question is whether to trust it.")],
           "<p>Tree-based models can't extrapolate, and linear models extrapolate whether or not the trend continues. Check new data against the training range before you rely on either.</p>",
           "Cheatsheet page 4: Model families", minutes=3)

    choice("f7-kmeans", "Segments from k-means",
           "<p>You segment customers with k-means on two features: annual income in thousands, from 20 to 400, and store visits per month, from 0 to 30.</p>"
           "<p>Select the true statements.</p>",
           [("Standardize the features first, or income will dominate the distances.", True, "k-means uses Euclidean distance, and income has a much larger range."),
            ("The result depends on the starting centers, so run several starts and keep the best.", True, "scikit-learn's n_init does this."),
            ("Choose the k with the lowest inertia.", False, "Inertia always falls as k grows. It reaches 0 when every point is its own cluster."),
            ("The elbow of the inertia curve and the silhouette score are common guides for choosing k.", True, "Both are heuristics. Check that the segments make business sense."),
            ("If k-means returns four clusters, the customers form four natural groups.", False, "k-means returns k clusters for any data, including data with no group structure.")],
           "<p>k-means always returns an answer. Scaling, the choice of k, and the starting centers all change it, so validate the segments against something outside the algorithm.</p>",
           "Cheatsheet page 4: Model families", minutes=3)

    # ============================================================ ML: set F8
    choice("f8-time", "Validating a forecast",
           "<p>You build a model to forecast next week's demand from three years of daily history. Which validation scheme fits?</p>",
           [("Train on data up to a cutoff date, validate on the weeks that follow, and repeat with later cutoffs.", True, "Each validation period lies after its training data, as it will in use."),
            ("Shuffled 5-fold cross-validation.", False, "Each fold would train on days that come after the days it validates on."),
            ("Stratified 5-fold cross-validation on the demand level.", False, "Stratifying balances the target. It doesn't keep the time order."),
            ("Leave-one-out cross-validation.", False, "Every model would see the days on both sides of the day it predicts."),
            ("A random 80/20 split with a fixed seed.", False, "A fixed seed makes the split repeatable. It is still a split that mixes past and future.")],
           "<p>For anything that predicts the future, validate forward in time. In scikit-learn, <code>TimeSeriesSplit</code> builds these expanding windows.</p>",
           "Cheatsheet page 5: Validation", minutes=2)

    choice("f8-aggregates", "Features built from history",
           "<p>To predict whether an order placed today will be returned, a team adds two features: the customer's average return rate over their whole history in the data set, and the mean return rate of the order's product category, computed on all rows.</p>"
           "<p>Select the true statements.</p>",
           [("Both features use information from after the order date, this order's own outcome included.", True, "The whole history contains this order and later ones."),
            ("The fix is to compute each aggregate from data before each order's date only.", True, "A point-in-time feature is one you could have computed on that day."),
            ("The features are safe as long as the test set is kept separate.", False, "The aggregates were computed over all rows, so test labels are already inside the training features."),
            ("The validation score will overstate how the model does in production.", True, "In production the future outcomes don't exist yet."),
            ("This kind of leak matters only for tree-based models.", False, "Any model will use a feature that contains the label.")],
           "<p>Aggregates are the easiest place to leak. For each feature, name the latest timestamp it depends on, and check that it is earlier than the prediction time.</p>",
           "Cheatsheet page 5: Data leakage", minutes=3)

    choice("f8-groups", "Ten scans per patient",
           "<p>A data set holds 5,000 scans from 500 patients, 10 scans each. A model scores 0.97 accuracy under a random split of the scans and 0.80 at a new hospital.</p>"
           "<p>Which change to the validation gives the most honest estimate?</p>",
           [("Split by patient, for example with GroupKFold, so that all of a patient's scans fall on one side.", True, "The model then has to work on patients it has never seen."),
            ("Stratify the random split by diagnosis.", False, "That balances the classes. The same patients still appear on both sides."),
            ("Use more folds in the random split.", False, "Every fold still shares patients between training and validation."),
            ("Hold out a random 10% of the scans as a final test set.", False, "A random sample of scans contains the same patients as the training set."),
            ("Shuffle the scans again with a different seed.", False, "The seed changes which scans go where. The leak between scans of one patient remains.")],
           "<p>When rows come in groups, the model can recognize the group in place of the signal. Split on the unit you want to generalize to: the patient, the customer, or the site.</p>",
           "Cheatsheet page 5: Validation, Data leakage", minutes=2)

    choice("f8-tuning", "Two hundred configurations",
           "<p>You try 200 hyperparameter configurations and keep the one with the best validation score, 0.874. On the untouched test set, that model scores 0.851.</p>"
           "<p>Select the true statements.</p>",
           [("The winner's validation score is biased upward, because it is the best of 200 noisy estimates.", True, "Selecting the maximum picks up luck as well as skill."),
            ("The test score is the one to report.", True, "It played no part in the selection."),
            ("You should keep tuning against the test set until it also reaches 0.874.", False, "That turns the test set into a second validation set, and its score stops being honest."),
            ("The gap proves that there is a bug in the pipeline.", False, "A gap of this size is expected after a wide search. It is selection bias."),
            ("Nested cross-validation would estimate the performance of the whole tuning procedure.", True, "The outer folds score models whose tuning never saw them.")],
           "<p>The more configurations you compare on a validation set, the more optimistic its best score becomes. Keep the test set for one final measurement.</p>",
           "Cheatsheet page 5: Validation", minutes=3)

    choice("f8-online", "Better offline, flat online",
           "<p>A new recommendation model raises the offline AUC from 0.80 to 0.83. In a two-week A/B test, conversion is the same in both arms.</p>"
           "<p>Select the plausible explanations.</p>",
           [("The offline metric doesn't measure what drives conversion.", True, "Ranking logged clicks better is not the same as changing what people buy."),
            ("The logged data reflects what the old model chose to show, so the offline comparison is biased.", True, "The new model is scored only on items that the old one exposed."),
            ("The test may be too small to detect the effect. Check the confidence interval of the difference.", True, "A flat result with a wide interval is inconclusive, not a proof of no effect."),
            ("An AUC gain guarantees a conversion gain, so the A/B test must be faulty.", False, "Offline metrics are proxies. The experiment measures the outcome you care about."),
            ("The result shows that offline evaluation has no value and can be dropped.", False, "Offline evaluation is still the cheap filter that decides what is worth testing online.")],
           "<p>Offline metrics tell you whether a model is better at the task you framed. Only an experiment tells you whether the task was the right one.</p>",
           "Cheatsheet page 5: Classification metrics", minutes=3)

    choice("f8-early", "Loss that turns",
           "<p>While a neural network trains, the training loss falls every epoch. The validation loss falls until epoch 12 and rises after it.</p>"
           "<p>What is the standard response?</p>",
           [("Stop training and keep the weights from epoch 12.", True, "That is early stopping. After epoch 12 the network fits noise in the training data."),
            ("Keep training until the training loss reaches zero.", False, "The validation loss is already rising, so more training makes the model worse on new data."),
            ("Raise the learning rate so that the validation loss falls again.", False, "The problem is overfitting, not slow optimization."),
            ("Remove dropout so that the network can fit better.", False, "Dropout is a regularizer. Removing it would bring the turn earlier."),
            ("Evaluate on the training set, because its loss is still improving.", False, "Training loss can't tell you how the model does on new data.")],
           "<p>The turn in the validation loss marks where the model starts to overfit. Early stopping, dropout, weight decay, and more data all push that point later or lower.</p>",
           "Cheatsheet page 5: Neural network fundamentals", minutes=2)
