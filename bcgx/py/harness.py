"""Shared assertions for the DSF trainer (browser runner and local checker)."""


def expect_equal(got, exp):
    if got != exp:
        raise AssertionError(f"EXPECTED {exp!r}\nACTUAL {got!r}")


def expect_close(got, exp, tol=1e-6):
    try:
        ok = abs(float(got) - float(exp)) <= tol
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise AssertionError(f"EXPECTED {exp}\nACTUAL {got}")


def expect_array(got, exp, tol=1e-6):
    import numpy as np

    g = np.asarray(got, dtype=float)
    e = np.asarray(exp, dtype=float)
    if g.shape != e.shape or not np.allclose(g, e, rtol=1e-5, atol=tol, equal_nan=True):
        raise AssertionError(f"EXPECTED {e.tolist()}\nACTUAL {g.tolist()}")


def expect_frame(got, exp, sort_by=None):
    import pandas as pd

    if not isinstance(got, pd.DataFrame):
        raise AssertionError(f"EXPECTED a DataFrame\nACTUAL {type(got).__name__}: {got!r}")
    g = got.copy()
    e = exp.copy()
    g.columns = [str(c) for c in g.columns]
    e.columns = [str(c) for c in e.columns]
    if list(g.columns) != list(e.columns):
        raise AssertionError(
            "EXPECTED columns "
            + repr(list(e.columns))
            + "\nACTUAL columns "
            + repr(list(g.columns))
            + "\nACTUAL\n"
            + g.head(12).to_string()
        )
    if sort_by:
        g = g.sort_values(list(sort_by), kind="mergesort").reset_index(drop=True)
        e = e.sort_values(list(sort_by), kind="mergesort").reset_index(drop=True)
    else:
        g = g.reset_index(drop=True)
        e = e.reset_index(drop=True)
    try:
        pd.testing.assert_frame_equal(
            g, e, check_dtype=False, check_exact=False, rtol=1e-4, atol=1e-6
        )
    except AssertionError:
        raise AssertionError(f"EXPECTED\n{e.to_string()}\nACTUAL\n{g.to_string()}")
