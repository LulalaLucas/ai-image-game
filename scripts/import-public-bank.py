#!/usr/bin/env python3
"""Import publicly served Real or Not and SpotfAIke image banks for local review.

Use Python 3 and curl. Labels/model names remain publisher claims. Downloading
these assets does not establish permission to redistribute them.
"""
import argparse
import concurrent.futures
import hashlib
import json
import subprocess
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import quote, urljoin

MANIFESTS = {
    "realornot": "https://www.realornotquiz.com/assets/json/images.json",
    "spotfaike": "https://www.spotfaike.com/data/images.json",
}
MODELS = {"amazon_titan": "Amazon Titan", "dalle3": "DALL-E 3", "Midjourney": "Midjourney", "stable_diffusion3": "Stable Diffusion 3"}


def get(url):
    return subprocess.run(["curl", "-fLsS", "--max-time", "35", "--retry", "1", "--retry-delay", "1", "--max-filesize", "15000000", quote(url, safe=":/?&=%#@+;,")], check=True, capture_output=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", default=date.today().isoformat())
    parser.add_argument("--snapshot-dir", type=Path)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    date.fromisoformat(args.as_of)
    root = Path(__file__).resolve().parent.parent
    target = root / "assets" / "questions"
    target.mkdir(parents=True, exist_ok=True)
    snapshots = {"realornot": "realornot_bank.json", "spotfaike": "spotfaike_bank.json"}
    data = {}
    for site, url in MANIFESTS.items():
        raw = (args.snapshot_dir / snapshots[site]).read_bytes() if args.snapshot_dir else get(url)
        data[site] = json.loads(raw)
    candidates, excluded = [], Counter()
    for index, path in enumerate(data["realornot"], 1):
        parts = path.split("/")
        if parts[0] not in {"real", "fake"} or ".." in parts:
            raise ValueError("Unexpected public image path")
        ai = parts[0] == "fake"
        if ai and parts[1] == "Inpaintings":
            excluded["realornot_partial_ai_edits"] += 1
            continue
        conflict = ai and parts[1] == "stable_diffusion3" and "SDXL" in path
        candidates.append({"id": f"ron-{index:04d}", "label": "ai" if ai else "real",
            "model": MODELS.get(parts[1]) if ai and not conflict else None,
            "source": {"site": "Real or Not Quiz", "url": "https://www.realornotquiz.com/"},
            "remote": urljoin("https://www.realornotquiz.com/assets/img/gameImages/", path),
            "evidence": "public_path_and_game_answer_logic", "modelEvidence": "conflicting_folder_and_filename" if conflict else "folder_name" if ai and parts[1] in MODELS else None})
    for item in data["spotfaike"]:
        src = item.get("source", {})
        if not item.get("approved") or item.get("label") not in {"ai", "real"}:
            excluded["spotfaike_unapproved"] += 1
            continue
        if item["publishDate"] > args.as_of:
            excluded["spotfaike_future"] += 1
            continue
        if src.get("dateGenerated", "") > item["publishDate"]:
            excluded["spotfaike_date_anomaly"] += 1
            continue
        candidates.append({"id": "spot-" + item["id"], "label": item["label"], "model": src.get("model"),
            "category": item.get("category"), "source": {"site": "SpotfAIke", "url": "https://www.spotfaike.com/play",
                **({"originalUrl": src["url"]} if src.get("url") else {}),
                **({"author": src["author"]} if src.get("author") else {}),
                **({"license": src["license"], "licenseUrl": src.get("licenseUrl")} if src.get("license") else {})},
            "remote": urljoin("https://www.spotfaike.com/", item["imageUrl"]),
            "evidence": "publisher_manifest", "modelEvidence": "publisher_metadata" if src.get("model") else None})

    def download(item):
        try:
            existing = list(target.glob(item["id"] + ".*"))
            raw = existing[0].read_bytes() if len(existing) == 1 else get(item["remote"])
            if raw[:3] == b"\xff\xd8\xff":
                ext = ".jpg"
            elif raw[:8] == b"\x89PNG\r\n\x1a\n":
                ext = ".png"
            elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
                ext = ".webp"
            else:
                raise ValueError("Response is not a supported JPEG, PNG or WebP image")
            if len(raw) < 100:
                raise ValueError("Image is empty or truncated")
            file = target / (item["id"] + ext)
            if not file.exists():
                temp = file.with_suffix(ext + ".part")
                temp.write_bytes(raw)
                temp.replace(file)
            question = {k:v for k,v in item.items() if k not in {"remote", "evidence", "modelEvidence"} and v is not None}
            question.update(src=file.relative_to(root).as_posix(), enabled=True)
            audit = {"id": item["id"], "remoteUrl": item["remote"], "sha256": hashlib.sha256(raw).hexdigest(),
                     "bytes": len(raw), "labelEvidence": item["evidence"], "modelEvidence": item.get("modelEvidence")}
            return question, audit, None
        except Exception as error:
            return None, None, {"id": item["id"], "url": item["remote"], "error": str(error)}

    questions, provenance, failures, duplicates = [], [], [], []
    seen_hashes = {}
    print(f"Downloading {len(candidates)} images from two public banks…", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as pool:
        for done, (question, audit, failure) in enumerate(pool.map(download, candidates), 1):
            if failure:
                failures.append(failure)
            else:
                previous = seen_hashes.get(audit["sha256"])
                if previous:
                    if previous["label"] != question["label"]:
                        raise ValueError("Identical image has conflicting source labels: " + question["id"])
                    duplicates.append({"id": question["id"], "duplicateOf": previous["id"]})
                    (root / question["src"]).unlink(missing_ok=True)
                else:
                    seen_hashes[audit["sha256"]] = question
                    questions.append(question)
                    provenance.append(audit)
            if done % 50 == 0 or done == len(candidates):
                print(f"{done}/{len(candidates)} processed, {len(failures)} failures", flush=True)
    excluded["duplicate_images"] = len(duplicates)
    audit_data = {"asOf": args.as_of, "manifests": MANIFESTS, "excluded": dict(excluded), "downloadFailures": failures, "duplicates": duplicates,
                  "labelCounts": dict(Counter(q["label"] for q in questions)), "images": provenance,
                  "note": "Publisher labels and model metadata; redistribution permission not established."}
    (root / "data" / "provenance.json").write_text(json.dumps(audit_data, ensure_ascii=False, indent=2) + "\n")
    if failures:
        raise SystemExit("Some downloads failed. Current questions.json was kept. Retry to resume cached downloads.")
    bank = {"version": 2, "demo": False, "questions": sorted(questions, key=lambda q:q["id"])}
    (root / "data" / "questions.json").write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"questions": len(questions), "labels": audit_data["labelCounts"], "excluded": dict(excluded)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
