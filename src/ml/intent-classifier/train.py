"""
Fine-tuning pipeline for intent classification.

Supports:
  - SetFit (few-shot, recommended for < 100 examples per class)
  - PhoBERT full fine-tuning (higher accuracy, requires 100+ examples per class)

Usage:
  python src/ml/intent-classifier/train.py \
    --data src/ml/intent-classifier/data/intents-university.json \
    --output src/ml/intent-classifier/models/university-v1 \
    --method setfit
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


def load_training_data(data_path: str):
    """Load labeled training data from JSON file.

    Expected format:
    {
      "domain": "university",
      "intents": [
        {
          "id": "QUERY_TUITION_SEMESTER",
          "examples": ["học phí kỳ này bao nhiêu", ...]
        },
        ...
      ]
    }
    """
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    texts = []
    labels = []
    intent_names = []

    for intent in data.get("intents", []):
        intent_id = intent["id"]
        intent_names.append(intent_id)
        for example in intent.get("examples", []):
            texts.append(example)
            labels.append(len(intent_names) - 1)  # Numeric label

    return texts, labels, intent_names


def train_setfit(texts: list[str], labels: list[int], intent_names: list[str], output_dir: str):
    """Train using SetFit (few-shot approach)."""
    try:
        from setfit import SetFitModel, Trainer, TrainingArguments
        from datasets import Dataset
    except ImportError:
        print("❌ setfit not installed. Run: pip install setfit")
        sys.exit(1)

    print(f"🚀 Training SetFit model with {len(texts)} examples, {len(intent_names)} intents")

    train_dataset = Dataset.from_dict({"text": texts, "label": labels})

    model = SetFitModel.from_pretrained("intfloat/multilingual-e5-small")

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_epochs=2,
        batch_size=16,
        evaluation_strategy="no",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
    )

    trainer.train()
    model.save_pretrained(output_dir)

    # Save metadata
    metadata = {
        "domain": "university",
        "intents": intent_names,
        "num_examples": len(texts),
        "method": "setfit",
        "base_model": "intfloat/multilingual-e5-small",
        "trained_at": datetime.now().isoformat(),
    }
    with open(os.path.join(output_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"✅ SetFit model saved to {output_dir}")
    return model


def train_phobert(texts: list[str], labels: list[int], intent_names: list[str], output_dir: str):
    """Full fine-tuning using PhoBERT."""
    try:
        from transformers import (
            AutoTokenizer,
            AutoModelForSequenceClassification,
            Trainer,
            TrainingArguments as HFTrainingArguments,
        )
        import torch
        from datasets import Dataset
    except ImportError:
        print("❌ transformers/torch not installed.")
        sys.exit(1)

    print(f"🚀 Fine-tuning PhoBERT with {len(texts)} examples, {len(intent_names)} intents")

    tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base-v2")
    model = AutoModelForSequenceClassification.from_pretrained(
        "vinai/phobert-base-v2",
        num_labels=len(intent_names),
    )

    def tokenize(examples):
        return tokenizer(examples["text"], padding="max_length", truncation=True, max_length=128)

    train_dataset = Dataset.from_dict({"text": texts, "label": labels}).map(tokenize, batched=True)

    training_args = HFTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=5,
        per_device_train_batch_size=8,
        save_steps=100,
        save_total_limit=2,
        logging_steps=10,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
    )

    trainer.train()
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

    metadata = {
        "domain": "university",
        "intents": intent_names,
        "num_examples": len(texts),
        "method": "phobert",
        "base_model": "vinai/phobert-base-v2",
        "trained_at": datetime.now().isoformat(),
    }
    with open(os.path.join(output_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"✅ PhoBERT model saved to {output_dir}")
    return model


def main():
    parser = argparse.ArgumentParser(description="Fine-tune intent classifier")
    parser.add_argument("--data", required=True, help="Path to training data JSON")
    parser.add_argument("--output", required=True, help="Output directory for the model")
    parser.add_argument(
        "--method",
        default="setfit",
        choices=["setfit", "phobert"],
        help="Training method (default: setfit)",
    )
    args = parser.parse_args()

    texts, labels, intent_names = load_training_data(args.data)

    if len(intent_names) == 0:
        print("❌ No intents found in training data")
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    if args.method == "setfit":
        train_setfit(texts, labels, intent_names, args.output)
    else:
        train_phobert(texts, labels, intent_names, args.output)


if __name__ == "__main__":
    main()
