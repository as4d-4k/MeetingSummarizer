"""
meetings/utils/transliterate.py
─────────────────────────────────
Converts Urdu (Arabic-script) AND Hindi (Devanagari) text to Roman Urdu.

Deepgram with language="multi" may output Urdu speech as:
  - Arabic/Nastaliq script (correct Urdu)
  - Devanagari script (misidentified as Hindi)
Both are converted to Roman Urdu (Latin characters).
English text passes through unchanged.

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

# ── Devanagari (Hindi) → Roman Urdu mapping ──────────────────────────────────
# Deepgram's "multi" mode sometimes outputs Urdu speech as Hindi/Devanagari.
_DEVANAGARI_WORD_MAP = {
    "मैं": "mein", "हम": "hum", "तुम": "tum", "आप": "aap",
    "वो": "woh", "यह": "yeh", "कौन": "kaun", "क्या": "kya",
    "कहाँ": "kahan", "कब": "kab", "क्यों": "kyun", "कैसे": "kaise",
    "कुछ": "kuch", "सब": "sab",
    "है": "hai", "हैं": "hain", "हूँ": "hun", "हूं": "hun",
    "था": "tha", "थी": "thi", "थे": "thay",
    "हो": "ho", "हुआ": "hua", "हुई": "hui",
    "होगा": "hoga", "होगी": "hogi",
    "कर": "kar", "करो": "karo", "करना": "karna",
    "करता": "karta", "करती": "karti", "करते": "kartay",
    "कर रहा": "kar raha", "कर रही": "kar rahi",
    "बोल": "bol", "बोलो": "bolo", "बोलना": "bolna",
    "देख": "dekh", "देखो": "dekho", "देखना": "dekhna",
    "सुन": "sun", "सुनो": "suno", "सुनना": "sunna",
    "चल": "chal", "चलो": "chalo", "चलना": "chalna",
    "रहा": "raha", "रही": "rahi", "रहे": "rahay",
    "सकता": "sakta", "सकती": "sakti", "सकते": "saktay",
    "चाहता": "chahta", "चाहती": "chahti", "चाहिए": "chahiye",
    "लगता": "lagta", "लगती": "lagti",
    "मिला": "mila", "मिली": "mili",
    "पता": "pata", "बताओ": "batao", "बताना": "batana",
    "समझ": "samajh", "सोच": "soch",
    "पढ़": "parh", "लिख": "likh",
    "और": "aur", "या": "ya", "लेकिन": "lekin", "मगर": "magar",
    "पर": "par", "का": "ka", "की": "ki", "के": "ke",
    "को": "ko", "से": "se", "ने": "ne",
    "पहले": "pehle", "बाद": "baad", "अभी": "abhi", "अब": "ab",
    "फिर": "phir", "भी": "bhi", "नहीं": "nahi", "हाँ": "haan",
    "जी": "ji", "ठीक": "theek", "अच्छा": "acha",
    "बहुत": "bohot", "ज़्यादा": "zyada", "कम": "kam",
    "बड़ा": "bara", "छोटा": "chhota", "नया": "naya",
    "लोग": "log", "आदमी": "aadmi", "घर": "ghar",
    "दिन": "din", "रात": "raat", "वक़्त": "waqt", "काम": "kaam",
    "बात": "baat", "तरह": "tarah", "साथ": "saath",
    "लिए": "liye", "वाला": "wala", "वाली": "wali", "वाले": "walay",
    "इस्तेमाल": "istemaal", "लैपटॉप": "laptop",
    "कंप्यूटर": "computer", "मोबाइल": "mobile",
    "फ़ोन": "phone", "वीडियो": "video",
    "मीटिंग": "meeting", "प्रोजेक्ट": "project",
}

_DEVANAGARI_CHAR_MAP = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah",
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "w", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h",
    "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "फ़": "f", "ड़": "r", "ढ़": "rh",
    # Matras (vowel signs)
    "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
    "ं": "n", "ँ": "n", "ः": "h",
    "्": "",  # Halant — suppresses inherent vowel
    "़": "",  # Nukta
    # Numerals
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
    "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
    # Punctuation
    "।": ".", "?": "?",
}

# Regex to detect Urdu/Arabic script characters
_URDU_RANGE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]")
# Regex to detect Devanagari (Hindi) script characters
_DEVANAGARI_RANGE = re.compile(r"[\u0900-\u097F]")
# Combined: either script
_NON_LATIN_RANGE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\u0900-\u097F]")


def contains_urdu(text: str) -> bool:
    """Check if text contains any Urdu/Arabic-script characters."""
    return bool(_URDU_RANGE.search(text))


def contains_devanagari(text: str) -> bool:
    """Check if text contains any Devanagari (Hindi) script characters."""
    return bool(_DEVANAGARI_RANGE.search(text))


def contains_non_latin(text: str) -> bool:
    """Check if text contains any non-Latin script (Urdu or Hindi)."""
    return bool(_NON_LATIN_RANGE.search(text))


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


def devanagari_to_roman(text: str) -> str:
    """
    Transliterate Devanagari (Hindi) script text to Roman Urdu.

    Deepgram's multi mode sometimes outputs Urdu speech as Hindi/Devanagari.
    This converts it to the same Roman Urdu output as Arabic script.
    """
    if not contains_devanagari(text):
        return text

    result = text

    # Replace individual Devanagari characters
    for deva_char, roman_char in _DEVANAGARI_CHAR_MAP.items():
        result = result.replace(deva_char, roman_char)

    # Clean up remaining Devanagari characters
    result = re.sub(r"[\u0900-\u097F]", "", result)

    # Collapse multiple spaces
    result = re.sub(r"\s+", " ", result).strip()

    return result


def transliterate_mixed(text: str) -> str:
    """
    Smart transliteration for mixed Urdu/Hindi/English text.

    1. If text is pure Latin (English) → return as-is (fast path)
    2. For each word:
       a. Check against Urdu word map (Arabic script)
       b. Check against Hindi word map (Devanagari script)
       c. Fall back to character-by-character transliteration
    3. Leaves English tokens untouched
    """
    if not contains_non_latin(text):
        return text  # Pure English — pass through unchanged

    tokens = text.split()
    result_tokens = []

    for token in tokens:
        # Already Latin script — keep as-is (English words)
        if not contains_non_latin(token):
            result_tokens.append(token)
            continue

        # Strip punctuation for lookup, reattach after
        stripped = token.strip(".,!?;:\"'()[]{}")
        trailing = token[len(stripped):] if len(stripped) < len(token) else ""

        # Check Urdu (Arabic script) word lookup table
        if stripped in _WORD_MAP:
            result_tokens.append(_WORD_MAP[stripped] + trailing)
        # Check Hindi (Devanagari) word lookup table
        elif stripped in _DEVANAGARI_WORD_MAP:
            result_tokens.append(_DEVANAGARI_WORD_MAP[stripped] + trailing)
        # Fall back to character-by-character transliteration
        elif contains_urdu(token):
            result_tokens.append(urdu_to_roman(token))
        elif contains_devanagari(token):
            result_tokens.append(devanagari_to_roman(token))
        else:
            result_tokens.append(token)

    return " ".join(result_tokens)
