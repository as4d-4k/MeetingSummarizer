"""
meetings/utils/transliterate.py
─────────────────────────────────
Converts Urdu (Arabic-script) text to Roman Urdu (Latin script).

Used in the real-time transcript webhook to ensure all live output
is displayed in Latin characters — English stays English, Urdu becomes
phonetic Roman Urdu.

This is a rule-based transliteration (no API calls, runs in microseconds)
suitable for real-time streaming.
"""

import re

# ── Common Urdu words → Roman Urdu (exact match) ─────────────────────────────
# These override the character-by-character mapping for accuracy.
_WORD_MAP = {
    # Pronouns
    "میں": "mein",
    "ہم": "hum",
    "تم": "tum",
    "آپ": "aap",
    "وہ": "woh",
    "یہ": "yeh",
    "کون": "kaun",
    "کیا": "kya",
    "کہاں": "kahan",
    "کب": "kab",
    "کیوں": "kyun",
    "کیسے": "kaise",
    "کچھ": "kuch",
    "سب": "sab",
    # Common verbs
    "ہے": "hai",
    "ہیں": "hain",
    "ہوں": "hun",
    "تھا": "tha",
    "تھی": "thi",
    "تھے": "thay",
    "ہو": "ho",
    "ہوا": "hua",
    "ہوئی": "hui",
    "ہوگا": "hoga",
    "ہوگی": "hogi",
    "کر": "kar",
    "کرو": "karo",
    "کرنا": "karna",
    "کرتا": "karta",
    "کرتی": "karti",
    "کرتے": "kartay",
    "کریں": "karein",
    "کئی": "kai",
    "جا": "ja",
    "جاؤ": "jao",
    "جانا": "jana",
    "جاتا": "jata",
    "جاتی": "jati",
    "آ": "aa",
    "آؤ": "aao",
    "آنا": "aana",
    "آتا": "aata",
    "آتی": "aati",
    "لے": "le",
    "لو": "lo",
    "لینا": "lena",
    "دے": "de",
    "دو": "do",
    "دینا": "dena",
    "بول": "bol",
    "بولو": "bolo",
    "بولنا": "bolna",
    "دیکھ": "dekh",
    "دیکھو": "dekho",
    "دیکھنا": "dekhna",
    "سن": "sun",
    "سنو": "suno",
    "سننا": "sunna",
    "چل": "chal",
    "چلو": "chalo",
    "چلنا": "chalna",
    "رہا": "raha",
    "رہی": "rahi",
    "رہے": "rahay",
    "سکتا": "sakta",
    "سکتی": "sakti",
    "سکتے": "saktay",
    "چاہتا": "chahta",
    "چاہتی": "chahti",
    "چاہیے": "chahiye",
    "لگتا": "lagta",
    "لگتی": "lagti",
    "ملا": "mila",
    "ملی": "mili",
    "پتا": "pata",
    "بتاؤ": "batao",
    "بتانا": "batana",
    "سمجھ": "samajh",
    "سوچ": "soch",
    "پڑھ": "parh",
    "لکھ": "likh",
    # Common particles / connectors
    "اور": "aur",
    "یا": "ya",
    "لیکن": "lekin",
    "مگر": "magar",
    "پر": "par",
    "کا": "ka",
    "کی": "ki",
    "کے": "ke",
    "کو": "ko",
    "سے": "se",
    "نے": "ne",
    "پہلے": "pehle",
    "بعد": "baad",
    "ابھی": "abhi",
    "اب": "ab",
    "پھر": "phir",
    "بھی": "bhi",
    "نہیں": "nahi",
    "ہاں": "haan",
    "جی": "ji",
    "ٹھیک": "theek",
    "اچھا": "acha",
    "بہت": "bohot",
    "زیادہ": "zyada",
    "کم": "kam",
    "بڑا": "bara",
    "چھوٹا": "chhota",
    "نیا": "naya",
    "پرانا": "purana",
    "لوگ": "log",
    "آدمی": "aadmi",
    "عورت": "aurat",
    "بچہ": "bacha",
    "بچے": "bachay",
    "گھر": "ghar",
    "دن": "din",
    "رات": "raat",
    "وقت": "waqt",
    "کام": "kaam",
    "بات": "baat",
    "طرح": "tarah",
    "ساتھ": "saath",
    "لیے": "liye",
    "والا": "wala",
    "والی": "wali",
    "والے": "walay",
    # Tech / meeting words
    "استعمال": "istemaal",
    "استمال": "istemaal",
    "لیپ": "laptop",
    "ٹاپ": "top",
    "کمپیوٹر": "computer",
    "موبائل": "mobile",
    "فون": "phone",
    "ویڈیو": "video",
    "میٹنگ": "meeting",
    "پروجیکٹ": "project",
}

# ── Multi-char combos (digraphs) ──
_DIGRAPH_MAP = [
    ("کھ", "kh"),
    ("گھ", "gh"),
    ("چھ", "chh"),
    ("بھ", "bh"),
    ("پھ", "ph"),
    ("تھ", "th"),
    ("ٹھ", "th"),
    ("جھ", "jh"),
    ("دھ", "dh"),
    ("ڈھ", "dh"),
    ("رھ", "rh"),
    ("ڑھ", "rh"),
    ("لھ", "lh"),
    ("مھ", "mh"),
    ("نھ", "nh"),
    ("شھ", "shh"),
]

_CHAR_MAP = {
    # Basic consonants
    "ا": "a",
    "آ": "aa",
    "ب": "b",
    "پ": "p",
    "ت": "t",
    "ٹ": "t",
    "ث": "s",
    "ج": "j",
    "چ": "ch",
    "ح": "h",
    "خ": "kh",
    "د": "d",
    "ڈ": "d",
    "ذ": "z",
    "ر": "r",
    "ڑ": "r",
    "ز": "z",
    "ژ": "zh",
    "س": "s",
    "ش": "sh",
    "ص": "s",
    "ض": "z",
    "ط": "t",
    "ظ": "z",
    "ع": "a",
    "غ": "gh",
    "ف": "f",
    "ق": "q",
    "ک": "k",
    "گ": "g",
    "ل": "l",
    "م": "m",
    "ن": "n",
    "ں": "n",
    "و": "w",
    "ہ": "h",
    "ھ": "h",
    "ی": "y",
    "ے": "ay",
    "ئ": "i",
    "ء": "",
    # Diacritics (short vowels)
    "\u064E": "a",   # fatha
    "\u064F": "u",   # damma
    "\u0650": "i",   # kasra
    "\u0651": "",    # shadda
    "\u0652": "",    # sukun
    "\u0670": "a",   # superscript alef
    # Numerals
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    # Punctuation
    "۔": ".",
    "؟": "?",
    "،": ",",
    "؛": ";",
    "\u200c": "",  # ZWNJ
    "\u200d": "",  # ZWJ
}

# Regex to detect Urdu/Arabic script characters
_URDU_RANGE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")


def contains_urdu(text: str) -> bool:
    """Check if text contains any Urdu/Arabic-script characters."""
    return bool(_URDU_RANGE.search(text))


def urdu_to_roman(text: str) -> str:
    """
    Transliterate Urdu (Arabic-script) text to Roman Urdu.

    - Handles digraphs (کھ → kh, گھ → gh, etc.)
    - Preserves existing Latin characters (English words)
    - Preserves numbers and basic punctuation
    """
    if not contains_urdu(text):
        return text

    result = text

    # Step 1: Replace digraphs first (order matters!)
    for urdu, roman in _DIGRAPH_MAP:
        result = result.replace(urdu, roman)

    # Step 2: Replace individual characters
    for urdu_char, roman_char in _CHAR_MAP.items():
        result = result.replace(urdu_char, roman_char)

    # Step 3: Clean up — remove remaining Arabic diacritics
    result = re.sub(r"[\u0610-\u061A\u064B-\u065F\u0670]", "", result)

    # Collapse multiple spaces
    result = re.sub(r"\s+", " ", result).strip()

    return result


def transliterate_mixed(text: str) -> str:
    """
    Smart transliteration for mixed Urdu-English text.

    1. First checks each word against a common-words dictionary
    2. Falls back to character-by-character transliteration
    3. Leaves English tokens untouched
    """
    if not contains_urdu(text):
        return text

    tokens = text.split()
    result_tokens = []

    for token in tokens:
        if not contains_urdu(token):
            # Already Latin script — keep as-is
            result_tokens.append(token)
            continue

        # Strip punctuation for lookup, reattach after
        stripped = token.strip(".,!?;:\"'()[]{}")
        trailing = token[len(stripped):] if len(stripped) < len(token) else ""

        # Check word lookup table first
        if stripped in _WORD_MAP:
            result_tokens.append(_WORD_MAP[stripped] + trailing)
        else:
            # Fall back to character-by-character transliteration
            result_tokens.append(urdu_to_roman(token))

    return " ".join(result_tokens)
