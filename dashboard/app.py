"""Fact Find compare review dashboard.

Every verdict shown here is produced by the TypeScript runner
(src/agents/complaints-workflow/factfind-report.ts), which walks the same map,
getter and matchers the assertion uses. This app only arranges the answers.

    streamlit run dashboard/app.py
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import altair as alt
import pandas as pd
import streamlit as st

REPO = Path(__file__).resolve().parent.parent
REPORT_TS = "src/agents/complaints-workflow/factfind-report.ts"
REPORT_JS = "dist/src/agents/complaints-workflow/factfind-report.js"

VERDICT_ICON = {"ok": "✅", "fail": "❌", "skip": "➖"}
VERDICT_LABEL = {"ok": "asserted", "fail": "mismatch", "skip": "not asserted"}
VERDICT_COLOUR = {"ok": "#0f7b3f", "fail": "#b3261e", "skip": "#7a6a00"}
VERDICT_TINT = {"ok": "#eaf7ef", "fail": "#fdecea", "skip": "#fdf7e0"}

MATCH_HELP = {
    "equal": "Same text, ignoring case and punctuation.",
    "date": "Same moment. A date-only side is compared by day; 'ongoing' matches 'ongoing'.",
    "money": "Same amount once the currency is stripped. Skipped when either side omits it.",
    "contains": "Every source part appears in the UI copy.",
    "tenure": "Years and months within one month.",
    "set": "Same set of values, order ignored.",
}

st.set_page_config(
    page_title="Fact Find compare review",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
      .block-container { padding-top: 2rem; max-width: 1500px; }
      .hero {
        background: linear-gradient(120deg, #0b3c6a 0%, #14608f 55%, #1c7f7f 100%);
        border-radius: 16px; padding: 22px 26px; color: #fff; margin-bottom: 18px;
        box-shadow: 0 10px 24px rgba(11,60,106,.18);
      }
      .hero h1 { margin: 0; font-size: 1.55rem; font-weight: 650; letter-spacing: -.01em; }
      .hero p { margin: .35rem 0 0; opacity: .85; font-size: .92rem; }
      .pill {
        display: inline-block; padding: 3px 11px; border-radius: 999px; font-size: .74rem;
        font-weight: 600; background: rgba(255,255,255,.16); margin-right: 6px;
      }
      .card {
        border: 1px solid #e6e8eb; border-radius: 14px; padding: 16px 18px;
        background: #fff; color: #101828; box-shadow: 0 1px 3px rgba(16,24,40,.05);
        height: 100%;
      }
      .card .label { font-size: .74rem; text-transform: uppercase; letter-spacing: .06em; color: #667085; }
      .card .value { font-size: 1.6rem; font-weight: 640; margin-top: 2px; }
      .card .note { font-size: .78rem; color: #667085; }
      .chip {
        display: inline-block; padding: 2px 10px; border-radius: 999px;
        font-size: .76rem; font-weight: 600;
      }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
      .row-fail { border-left: 4px solid #b3261e; }
      .stTabs [data-baseweb="tab"] { font-weight: 600; }
      div[data-testid="stDataFrame"] { border-radius: 12px; }
    </style>
    """,
    unsafe_allow_html=True,
)


# ---------------------------------------------------------------- node bridge


@st.cache_data(show_spinner=False)
def run_report(args: tuple[str, ...]) -> tuple[Any, str]:
    """Runs the reporter and returns (parsed json, command used)."""
    attempts: list[list[str]] = [["npx", "tsx", REPORT_TS, *args]]
    if (REPO / REPORT_JS).exists():
        attempts.append(["node", REPORT_JS, *args])

    problems: list[str] = []
    for command in attempts:
        try:
            done = subprocess.run(
                command, cwd=REPO, capture_output=True, text=True, timeout=300
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as error:
            problems.append(f"$ {' '.join(command)}\n{error}")
            continue
        if done.returncode == 0 and done.stdout.strip():
            try:
                return json.loads(done.stdout), " ".join(command[:2])
            except json.JSONDecodeError as error:
                problems.append(f"$ {' '.join(command)}\nBad JSON: {error}\n{done.stdout[:400]}")
                continue
        problems.append(
            f"$ {' '.join(command)}\nexit {done.returncode}\n{(done.stderr or done.stdout)[-700:]}"
        )

    raise RuntimeError(
        "Could not run the reporter.\n\n"
        + "\n\n".join(problems)
        + "\n\nFrom the repo root, `npx tsx " + REPORT_TS + " all` should print JSON."
    )


# ------------------------------------------------------------------- shaping


def field_frame(fields: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "": VERDICT_ICON[row["verdict"]],
                "Field": row["field"],
                "Match": row["match"],
                "Source (aggregated JSON)": " · ".join(row["source"]) or "—",
                "Shown (fact_find)": " · ".join(row["ui"]) or "—",
                "Verdict": VERDICT_LABEL[row["verdict"]],
            }
            for row in fields
        ]
    )


def tint_rows(frame: pd.DataFrame) -> Any:
    def paint(row: pd.Series) -> list[str]:
        verdict = {v: k for k, v in VERDICT_LABEL.items()}[row["Verdict"]]
        if verdict == "ok":
            return [""] * len(row)
        return [f"background-color: {VERDICT_TINT[verdict]}"] * len(row)

    return frame.style.apply(paint, axis=1)


def show_fields(fields: list[dict], key: str) -> None:
    if not fields:
        st.info("No rows.")
        return
    only_issues = st.toggle(
        "Only rows that failed or were not asserted", key=key, value=False
    )
    rows = [row for row in fields if row["verdict"] != "ok"] if only_issues else fields
    if not rows:
        st.success("Every row on this panel was asserted and matched.")
        return
    st.dataframe(tint_rows(field_frame(rows)), width="stretch", hide_index=True)


def tally(report: dict) -> dict[str, int]:
    counts = {"ok": 0, "fail": 0, "skip": 0, "rows": 0}
    for customer in report.get("compare", {}).get("customers", []):
        fields = list(customer.get("fields", []))
        for collection in customer.get("collections", []):
            counts["rows"] += len(collection.get("rows", []))
            for row in collection.get("rows", []):
                fields.extend(row.get("fields", []))
        for field in fields:
            counts[field["verdict"]] += 1
    return counts


def card(label: str, value: Any, note: str = "", colour: str | None = None) -> str:
    tone = f"color:{colour};" if colour else ""
    return (
        f'<div class="card"><div class="label">{label}</div>'
        f'<div class="value" style="{tone}">{value}</div>'
        f'<div class="note">{note}</div></div>'
    )


def chip(verdict: str) -> str:
    return (
        f'<span class="chip" style="background:{VERDICT_TINT[verdict]};'
        f'color:{VERDICT_COLOUR[verdict]}">{VERDICT_ICON[verdict]} {VERDICT_LABEL[verdict]}</span>'
    )


# -------------------------------------------------------------------- sidebar

with st.sidebar:
    st.markdown("### 🔍 Fact Find review")
    st.caption("Aggregated source JSON vs the ADK `fact_find` the agent asked us to render.")

    if st.button("↻ Re-run the compare", width="stretch", type="primary"):
        st.cache_data.clear()
        st.rerun()

try:
    bundle, command_used = run_report(("all",))
except RuntimeError as error:
    st.error("The reporter did not run.")
    st.code(str(error))
    st.stop()

contract_rows: list[dict] = bundle["map"]
reports: list[dict] = bundle["reports"]

with st.sidebar:
    labels = {}
    for index, report in enumerate(reports):
        icon = "✅" if report.get("ok") else "❌"
        labels[index] = f"{icon} {report['complaintRef']} · {report['adkFile']}"
    picked = st.radio(
        "Fixture pairs",
        options=list(labels),
        format_func=lambda index: labels[index],
        label_visibility="visible",
    )

    with st.expander("Compare your own two files"):
        aggregated_upload = st.file_uploader("Aggregated payload", type="json", key="agg")
        adk_upload = st.file_uploader("ADK trace", type="json", key="adk")
        use_upload = st.button("Compare uploads", width="stretch")

    st.divider()
    st.caption(f"Ran via `{command_used}`")
    st.caption(f"{len(reports)} pairs · {len(contract_rows)} contract rows")

report = reports[picked]

if use_upload:
    if not (aggregated_upload and adk_upload):
        st.sidebar.warning("Pick both files first.")
    else:
        holding = Path(tempfile.mkdtemp(prefix="factfind-"))
        left, right = holding / aggregated_upload.name, holding / adk_upload.name
        left.write_bytes(aggregated_upload.getvalue())
        right.write_bytes(adk_upload.getvalue())
        try:
            report, _ = run_report(("report", str(left), str(right)))
        except RuntimeError as error:
            st.error("Could not compare the uploaded pair.")
            st.code(str(error))
            st.stop()

if report.get("error"):
    st.error(f"{report['adkFile']} could not be read: {report['error']}")
    st.stop()


# ---------------------------------------------------------------------- hero

counts = tally(report)
compare = report["compare"]
verdict_line = (
    "Every asserted row matches" if report["ok"] else f"{len(report['failures'])} mismatch(es)"
)

st.markdown(
    f"""
    <div class="hero">
      <h1>{report['complaintRef']} — {verdict_line}</h1>
      <p>{report['aggregatedFile']} &nbsp;↔&nbsp; {report['adkFile']}</p>
      <div style="margin-top:12px">
        <span class="pill">{'PASS' if report['ok'] else 'FAIL'}</span>
        <span class="pill">UI from {report['uiOrigin']}</span>
        <span class="pill">{len(compare['customers'])} customer(s)</span>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

kpis = st.columns(5)
kpis[0].markdown(
    card(
        "Status",
        "PASS" if report["ok"] else "FAIL",
        "assert passes" if report["ok"] else "assert throws",
        VERDICT_COLOUR["ok"] if report["ok"] else VERDICT_COLOUR["fail"],
    ),
    unsafe_allow_html=True,
)
kpis[1].markdown(
    card("Asserted", counts["ok"], "values compared and equal", VERDICT_COLOUR["ok"]),
    unsafe_allow_html=True,
)
kpis[2].markdown(
    card("Mismatched", counts["fail"], "source ≠ screen", VERDICT_COLOUR["fail"]),
    unsafe_allow_html=True,
)
kpis[3].markdown(
    card(
        "Not asserted",
        counts["skip"],
        "source silent or UI omits the field",
        VERDICT_COLOUR["skip"],
    ),
    unsafe_allow_html=True,
)
kpis[4].markdown(
    card("Collection rows", counts["rows"], "accounts, needs, parties, notes"),
    unsafe_allow_html=True,
)

st.write("")

overview, customer_tab, collections_tab, contract_tab, lab_tab, json_tab = st.tabs(
    ["Overview", "Customers", "Collections", "Contract", "Locator lab", "Raw JSON"]
)


# ------------------------------------------------------------------- overview

with overview:
    matrix = pd.DataFrame(
        [
            {
                "": "✅" if row.get("ok") else "❌",
                "Ref": row["complaintRef"],
                "Aggregated": row["aggregatedFile"],
                "ADK trace": row["adkFile"],
                "fact_find from": row.get("uiOrigin", "—"),
                "Asserted": tally(row)["ok"],
                "Mismatched": tally(row)["fail"],
                "Not asserted": tally(row)["skip"],
            }
            for row in reports
        ]
    )
    st.markdown("#### Every fixture pair")
    st.dataframe(matrix, width="stretch", hide_index=True)

    melted = matrix.melt(
        id_vars="ADK trace",
        value_vars=["Asserted", "Mismatched", "Not asserted"],
        var_name="Outcome",
        value_name="Rows",
    )
    chart = (
        alt.Chart(melted)
        .mark_bar(cornerRadiusTopRight=4, cornerRadiusBottomRight=4)
        .encode(
            y=alt.Y("ADK trace:N", title=None, sort="-x"),
            x=alt.X("Rows:Q", title="contract rows judged"),
            color=alt.Color(
                "Outcome:N",
                scale=alt.Scale(
                    domain=["Asserted", "Mismatched", "Not asserted"],
                    range=[VERDICT_COLOUR["ok"], VERDICT_COLOUR["fail"], VERDICT_COLOUR["skip"]],
                ),
                legend=alt.Legend(orient="top", title=None),
            ),
            tooltip=["ADK trace", "Outcome", "Rows"],
        )
        .properties(height=30 * len(matrix) + 70)
    )
    st.altair_chart(chart, width="stretch")
    st.caption(
        "Older traces judge fewer rows: they omit balance fields, so those rows are skipped "
        "rather than asserted."
    )

    st.markdown(f"#### Failures for {report['adkFile']}")
    if report["ok"]:
        st.success("None. Every row the contract could assert matched.")
    else:
        for failure in report["failures"]:
            st.error(failure)


# ------------------------------------------------------------------ customers

with customer_tab:
    if not compare["partyIdsMatch"]:
        st.error(
            f"Party ids differ. Source: {', '.join(compare['sourcePartyIds']) or '(none)'} · "
            f"fact_find: {', '.join(compare['uiPartyIds']) or '(none)'}"
        )

    facts = report.get("facts", {})
    for customer in compare["customers"]:
        party_id = customer["partyId"]
        name = (
            facts.get("source", {})
            .get("customers", {})
            .get(party_id, {})
            .get("firstName", "")
        )
        surname = (
            facts.get("source", {})
            .get("customers", {})
            .get(party_id, {})
            .get("lastName", "")
        )
        failed = sum(1 for field in customer["fields"] if field["verdict"] == "fail")
        heading = f"{name} {surname}".strip() or party_id
        st.markdown(
            f"#### {heading} &nbsp;<span class='mono'>{party_id}</span> &nbsp;"
            f"{chip('fail') if failed else chip('ok')}",
            unsafe_allow_html=True,
        )
        if not customer["present"]:
            st.error("This party is missing from fact_find altogether.")
            continue
        show_fields(customer["fields"], key=f"fields-{party_id}")
        st.write("")


# ---------------------------------------------------------------- collections

with collections_tab:
    parties = [customer["partyId"] for customer in compare["customers"]]
    if not parties:
        st.info("No customers to show.")
    else:
        chosen = st.selectbox("Customer", parties, format_func=lambda value: f"party {value}")
        customer = next(row for row in compare["customers"] if row["partyId"] == chosen)

        for collection in customer["collections"]:
            source_ids = collection["sourceIds"]
            ui_ids = collection["uiIds"]
            state = chip("ok") if collection["idsMatch"] else chip("fail")
            st.markdown(
                f"#### {collection['name']} &nbsp;<span class='mono'>{len(source_ids)} source · "
                f"{len(ui_ids)} shown</span> &nbsp;{state}",
                unsafe_allow_html=True,
            )

            if not collection["idsMatch"]:
                missing = [value for value in source_ids if value not in ui_ids]
                extra = [value for value in ui_ids if value not in source_ids]
                left, right = st.columns(2)
                left.error("Missing from the screen:\n\n" + ("\n".join(f"- {v}" for v in missing) or "—"))
                right.warning("On screen but not in source:\n\n" + ("\n".join(f"- {v}" for v in extra) or "—"))
            elif not collection["rows"]:
                st.caption("Nothing recorded on either side — the accordion says so and the source agrees.")
            else:
                for index, row in enumerate(collection["rows"]):
                    bad = sum(1 for field in row["fields"] if field["verdict"] == "fail")
                    title = f"{VERDICT_ICON['fail'] if bad else VERDICT_ICON['ok']}  {row['id'] or row['key']}"
                    with st.expander(title, expanded=bool(bad)):
                        st.dataframe(
                            tint_rows(field_frame(row["fields"])),
                            width="stretch",
                            hide_index=True,
                        )
            st.write("")


# ------------------------------------------------------------------- contract

with contract_tab:
    st.markdown("#### The compare contract")
    st.caption(
        "One row per screenshot field, read straight from factfind-map.ts. "
        "Adding a field is one row there — no runner change."
    )
    frame = pd.DataFrame(contract_rows)
    frame = frame.rename(
        columns={
            "scope": "Scope",
            "field": "Field",
            "match": "Match",
            "optional": "Optional",
            "source": "Source path(s)",
            "ui": "UI locator",
            "uiTransform": "UI transform",
        }
    )

    filters = st.columns([2, 2, 3])
    scopes = filters[0].multiselect("Scope", sorted(frame["Scope"].unique()))
    matches = filters[1].multiselect("Match", sorted(frame["Match"].unique()))
    needle = filters[2].text_input("Search field or path", placeholder="balance, heading, party…")

    view = frame
    if scopes:
        view = view[view["Scope"].isin(scopes)]
    if matches:
        view = view[view["Match"].isin(matches)]
    if needle:
        mask = view.apply(
            lambda row: needle.lower() in " ".join(map(str, row.values)).lower(), axis=1
        )
        view = view[mask]

    st.dataframe(view, width="stretch", hide_index=True)
    st.markdown(f"`{len(view)}` of `{len(frame)}` rows")

    st.markdown("#### What each match type means")
    st.dataframe(
        pd.DataFrame(
            [{"Match": key, "Rule": value} for key, value in MATCH_HELP.items()]
        ),
        width="stretch",
        hide_index=True,
    )


# ----------------------------------------------------------------- locator lab

with lab_tab:
    st.markdown("#### Locator lab")
    st.caption(
        "Run a locator against this trace the way the getter does — the way to check a new "
        "contract row before you add it."
    )

    presets = {
        "Personal details → date_of_birth": {"accordion": "Personal details", "key": "date_of_birth"},
        "Personal details → name (scoped)": {"accordion": "Personal details", "key": "name"},
        "Related parties → name (scoped)": {
            "accordion": "Related parties",
            "list": True,
            "key": "name",
            "empty": "no related parties",
        },
        "Support needs → headings": {
            "accordion": "Support needs",
            "list": True,
            "key": "heading",
            "empty": "no support needs",
        },
        "Contact Notes → Contact date": {
            "accordion": "Contact Notes",
            "list": True,
            "label": "Contact date",
            "key": "text",
            "empty": "no contact notes",
        },
        "Accounts → related labels": {
            "accordion": "Accounts and products",
            "accounts": "related",
            "key": "label",
        },
    }
    preset_name = st.selectbox("Start from", list(presets))
    preset = presets[preset_name]

    left, right = st.columns(2)
    accordion = left.text_input("accordion", preset.get("accordion", ""))
    label = left.text_input("label (block)", preset.get("label", ""))
    key = left.text_input("key", preset.get("key", ""))
    keys = right.text_input("keys (regex)", preset.get("keys", ""))
    empty = right.text_input("empty (regex)", preset.get("empty", ""))
    as_list = right.checkbox("list rows", bool(preset.get("list")))
    accounts = right.selectbox(
        "accounts", ["", "true", "related", "unrelated"],
        index=["", "true", "related", "unrelated"].index(str(preset.get("accounts", "")) if preset.get("accounts") else ""),
    )

    locator: dict[str, Any] = {}
    for name, value in (
        ("accordion", accordion),
        ("label", label),
        ("key", key),
        ("keys", keys),
        ("empty", empty),
    ):
        if value.strip():
            locator[name] = value.strip()
    if as_list:
        locator["list"] = True
    if accounts:
        locator["accounts"] = True if accounts == "true" else accounts

    st.code(json.dumps(locator), language="json")

    if st.button("Run locator", type="primary"):
        trace = REPO / "fixtures" / report["adkFile"]
        if not trace.exists():
            st.warning("Locator lab reads fixtures by name; it does not hold uploaded files.")
        else:
            try:
                found, _ = run_report(("locate", str(trace), json.dumps(locator)))
            except RuntimeError as error:
                st.error("The locator did not run.")
                st.code(str(error))
            else:
                st.markdown(f"**Reads as:** `{found['locator']}`")
                for entry in found["customers"]:
                    st.markdown(f"**party {entry['partyId']}**")
                    if entry["found"] is None:
                        st.warning("undefined — nothing at that locator (a missing accordion reads this way)")
                    else:
                        st.json(entry["found"], expanded=True)


# ------------------------------------------------------------------ raw json

with json_tab:
    st.markdown("#### What each side read")
    st.caption(
        "The normalised views the matchers were handed, plus the flat facts projection."
    )
    picker = st.radio(
        "Show",
        ["Source view", "fact_find view", "Source facts", "fact_find facts"],
        horizontal=True,
    )
    payloads = {
        "Source view": report["views"]["source"],
        "fact_find view": report["views"]["ui"],
        "Source facts": report["facts"]["source"],
        "fact_find facts": report["facts"]["ui"],
    }
    st.json(payloads[picker], expanded=2)
    st.download_button(
        "Download this report as JSON",
        data=json.dumps(report, indent=2),
        file_name=f"{report['complaintRef']}-{report['adkFile']}-report.json",
        mime="application/json",
    )
