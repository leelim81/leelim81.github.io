#!/bin/sh
# CPU LoRA handoff for the coordinator. Does not download FUNSD, XFUND, or FormGym.
# Does not start training unless TRAIN_PILOT=1 and a local venv already exists.
set -eu
echo "parser gold: tools/forms-filler/eval/gold-synthetic.json"
echo "split manifest: tools/forms-filler/eval/manifest.json"
echo "held-out PDFs (not in git): /tmp/form-audit/heldout/"
echo "development PDFs (not in git): /tmp/form-audit/in/"
echo "shared-box venv from the research note: /tmp/lv"
echo "base: Qwen/Qwen2.5-0.5B-Instruct  challenger: Qwen/Qwen3-0.6B"
echo "Do not train on the development templates. They were already inspected."
if [ "${1:-}" = "funsd" ] || [ "${1:-}" = "xfund" ] || [ "${1:-}" = "formgym" ]; then
  echo "refusing $1: non-commercial or uncleared terms" >&2
  exit 2
fi
if [ ! -d /tmp/lv ]; then
  echo "training not started: /tmp/lv is not on this machine"
  exit 0
fi
if [ "${TRAIN_PILOT:-}" != "1" ]; then
  echo "training not started: set TRAIN_PILOT=1 on the machine that owns /tmp/lv"
  exit 0
fi
echo "TRAIN_PILOT=1 is set and /tmp/lv exists. This script does not launch a job by itself."
echo "Use the venv's python with peft LoRA r=8, seq 256, batch 1, on synthetic JSON only."
