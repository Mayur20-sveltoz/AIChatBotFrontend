import React, { useState, useRef, useEffect, useCallback } from "react";
import { askQuestion, getPdf, getChatHistory } from "../apiroute/chatbotApi";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';


import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';


// const wait = (milliseconds) =>
//   new Promise((resolve) => setTimeout(resolve, milliseconds));
const nextAnimationFrame = () =>
  new Promise((resolve) => {
    window.requestAnimationFrame(resolve);
  });


const normalizePdfText = (value = "") => {
  return String(value)
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/([\p{L}\p{N}])-\s+([\p{L}\p{N}])/gu, "$1$2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenizePdfText = (value = "") => {
  return normalizePdfText(value)
    .split(" ")
    .filter(Boolean);
};

const buildHighlightPhrases = (value = "") => {
  const source = Array.isArray(value)
    ? value.join("\n")
    : String(value || "");

  const cleanedSource = source
    .replace(/Source:\s*[\s\S]*$/i, "")
    .replace(/\r/g, "\n")
    .replace(/^\s*Answer\s*:?\s*/i, "")
    .replace(/^\s*Steps\s*:?\s*/im, "")
    .trim();

  if (!cleanedSource) {
    return [];
  }

  const phraseMap = new Map();

  const addPhrase = (
    originalText,
    type = "sentence",
    priority = 1
  ) => {
    const normalizedText =
      normalizePdfText(originalText);

    const tokens =
      tokenizePdfText(originalText);

    if (
      !normalizedText ||
      tokens.length < 2 ||
      normalizedText.length < 6
    ) {
      return;
    }

    const existing =
      phraseMap.get(normalizedText);

    if (
      !existing ||
      priority > existing.priority
    ) {
      phraseMap.set(normalizedText, {
        text: normalizedText,
        originalText:
          String(originalText || "").trim(),
        tokens,
        type,
        priority,
      });
    }
  };

  /*
   * 1. Numbered steps:
   * 1.
   * 2)
   * 10.
   */
  const numberedStepPattern =
    /(?:^|\n)\s*\d+\s*[.)]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[.)]\s*)|$)/g;

  let numberedStepMatch;
  let numberedStepsFound = false;

  while (
    (
      numberedStepMatch =
      numberedStepPattern.exec(
        cleanedSource
      )
    ) !== null
  ) {
    const stepText =
      numberedStepMatch[1]?.trim();

    if (!stepText) {
      continue;
    }

    numberedStepsFound = true;

    addPhrase(
      stepText,
      "numbered-step",
      6
    );
  }

  /*
   * 2. Bullet points.
   */
  cleanedSource
    .split(/\n+/)
    .map((line) =>
      line
        .replace(
          /^\s*[-*•]\s*/,
          ""
        )
        .trim()
    )
    .filter(Boolean)
    .forEach((line) => {
      addPhrase(
        line,
        "line",
        4
      );
    });

  /*
   * 3. Sentence-level phrases.
   */
  cleanedSource
    .replace(
      /(?:^|\n)\s*\d+\s*[.)]\s*/g,
      "\n"
    )
    .split(
      /(?<=[.!?;])\s+|\n+/
    )
    .map((sentence) =>
      sentence.trim()
    )
    .filter(Boolean)
    .forEach((sentence) => {
      addPhrase(
        sentence,
        "sentence",
        numberedStepsFound ? 3 : 5
      );
    });

  /*
   * 4. For long phrases, create overlapping windows.
   */
  Array.from(phraseMap.values())
    .forEach((phraseObject) => {
      const words =
        phraseObject.tokens;

      if (words.length <= 20) {
        return;
      }

      for (
        let start = 0;
        start < words.length;
        start += 8
      ) {
        const windowWords =
          words.slice(
            start,
            start + 14
          );

        if (
          windowWords.length >= 5
        ) {
          addPhrase(
            windowWords.join(" "),
            "window",
            2
          );
        }

        if (
          start + 14 >=
          words.length
        ) {
          break;
        }
      }
    });

  /*
   * 5. Extract useful identifiers:
   * 202.12
   * ABC-123
   * Error 45
   * Model X500
   * page 89
   */
  const identifierMatches =
    cleanedSource.match(
      /\b(?:[a-z]+\d+[a-z0-9.-]*|\d+[a-z]+[a-z0-9.-]*|\d+(?:[.-]\d+)+)\b/gi
    ) || [];

  identifierMatches.forEach(
    (identifier) => {
      addPhrase(
        identifier,
        "identifier",
        10
      );
    }
  );

  /*
   * Maximum 80 phrases so long answers are supported,
   * but matching remains controlled.
   */
  return Array.from(
    phraseMap.values()
  )
    .sort(
      (left, right) =>
        right.priority -
        left.priority ||
        right.tokens.length -
        left.tokens.length
    )
    .slice(0, 80);
};

const getTokenOverlap = (sourceTokens, targetTokens) => {
  const targetCounts = new Map();

  targetTokens.forEach((token) => {
    targetCounts.set(
      token,
      (targetCounts.get(token) || 0) + 1
    );
  });

  let matches = 0;

  sourceTokens.forEach((token) => {
    const available = targetCounts.get(token) || 0;

    if (available > 0) {
      matches += 1;
      targetCounts.set(token, available - 1);
    }
  });

  return {
    matches,
    coverage: sourceTokens.length
      ? matches / sourceTokens.length
      : 0,
    precision: targetTokens.length
      ? matches / targetTokens.length
      : 0,
  };
};

const getOrderedCoverage = (sourceTokens, targetTokens) => {
  if (!sourceTokens.length || !targetTokens.length) {
    return 0;
  }

  const dp = new Array(targetTokens.length + 1).fill(0);

  for (
    let sourceIndex = 1;
    sourceIndex <= sourceTokens.length;
    sourceIndex++
  ) {
    let diagonalValue = 0;

    for (
      let targetIndex = 1;
      targetIndex <= targetTokens.length;
      targetIndex++
    ) {
      const previousRowValue = dp[targetIndex];

      if (
        sourceTokens[sourceIndex - 1] ===
        targetTokens[targetIndex - 1]
      ) {
        dp[targetIndex] = diagonalValue + 1;
      } else {
        dp[targetIndex] = Math.max(
          dp[targetIndex],
          dp[targetIndex - 1]
        );
      }

      diagonalValue = previousRowValue;
    }
  }

  return dp[targetTokens.length] / sourceTokens.length;
};

const COMMON_PDF_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "from",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "then",
  "if",
  "you",
  "your",
  "it",
  "as",
  "at",
  "by",
  "go",
  "step",
  "page",
  "see",
]);

const isIdentifierToken = (token = "") => {
  return (
    /\d/.test(token) ||
    (
      /[a-z]/i.test(token) &&
      token.length >= 8
    )
  );
};

const getTokenWeight = (token = "") => {
  if (!token) {
    return 0;
  }

  if (/^\d+$/.test(token)) {
    return 3;
  }

  if (
    /\d/.test(token) &&
    /[a-z]/i.test(token)
  ) {
    return 4;
  }

  if (
    COMMON_PDF_WORDS.has(token)
  ) {
    return 0.35;
  }

  if (token.length >= 10) {
    return 2;
  }

  if (token.length >= 6) {
    return 1.5;
  }

  return 1;
};

const getWeightedCoverage = (
  sourceTokens,
  targetTokens
) => {
  const targetCounts = new Map();

  targetTokens.forEach((token) => {
    targetCounts.set(
      token,
      (targetCounts.get(token) || 0) + 1
    );
  });

  let totalWeight = 0;
  let matchedWeight = 0;
  let matchedTokens = 0;

  sourceTokens.forEach((token) => {
    const weight =
      getTokenWeight(token);

    totalWeight += weight;

    const available =
      targetCounts.get(token) || 0;

    if (available > 0) {
      matchedWeight += weight;
      matchedTokens += 1;

      targetCounts.set(
        token,
        available - 1
      );
    }
  });

  return {
    matchedTokens,
    weightedCoverage:
      totalWeight > 0
        ? matchedWeight /
        totalWeight
        : 0,
  };
};

const getIdentifierCoverage = (
  sourceTokens,
  targetTokens
) => {
  const identifiers =
    sourceTokens.filter(
      isIdentifierToken
    );

  if (!identifiers.length) {
    return 1;
  }

  const matchedIdentifiers =
    identifiers.filter(
      (identifier) =>
        targetTokens.includes(
          identifier
        )
    );

  return (
    matchedIdentifiers.length /
    identifiers.length
  );
};

const findExactTokenRange = (pageValues, phraseTokens) => {
  if (
    !phraseTokens.length ||
    phraseTokens.length > pageValues.length
  ) {
    return null;
  }

  for (
    let start = 0;
    start <= pageValues.length - phraseTokens.length;
    start++
  ) {
    let isExact = true;

    for (
      let offset = 0;
      offset < phraseTokens.length;
      offset++
    ) {
      if (
        pageValues[start + offset] !==
        phraseTokens[offset]
      ) {
        isExact = false;
        break;
      }
    }

    if (isExact) {
      return {
        start,
        end: start + phraseTokens.length - 1,
        score: 1,
        exact: true,
      };
    }
  }

  return null;
};

const findBestTokenRange = (
  pageTokens,
  phraseInput
) => {
  const phraseObject =
    typeof phraseInput === "string"
      ? {
        text: phraseInput,
        tokens:
          tokenizePdfText(
            phraseInput
          ),
        type: "sentence",
        priority: 1,
      }
      : phraseInput;

  const phraseTokens =
    phraseObject.tokens ||
    tokenizePdfText(
      phraseObject.text || ""
    );

  const pageValues =
    pageTokens.map(
      (item) => item.value
    );

  if (
    !phraseTokens.length ||
    !pageValues.length
  ) {
    return null;
  }

  /*
   * Exact match always wins.
   */
  const exactMatch =
    findExactTokenRange(
      pageValues,
      phraseTokens
    );

  if (exactMatch) {
    return {
      ...exactMatch,
      matchType: "exact",
      priority:
        phraseObject.priority || 1,
    };
  }

  /*
   * Very short phrases are dangerous unless
   * they contain an identifier.
   */
  if (
    phraseTokens.length <= 2 &&
    !phraseTokens.some(
      isIdentifierToken
    )
  ) {
    return null;
  }

  const phraseLength =
    phraseTokens.length;

  const phraseSet =
    new Set(phraseTokens);

  const minimumWindowLength =
    Math.max(
      2,
      phraseLength - 7
    );

  const maximumWindowLength =
    Math.min(
      pageValues.length,
      phraseLength + 14
    );

  let bestMatch = null;

  for (
    let start = 0;
    start < pageValues.length;
    start++
  ) {
    /*
     * At least one phrase token should appear
     * at the beginning of the candidate region.
     */
    if (
      !phraseSet.has(
        pageValues[start]
      )
    ) {
      continue;
    }

    for (
      let windowLength =
        minimumWindowLength;
      windowLength <=
      maximumWindowLength;
      windowLength++
    ) {
      const end =
        start + windowLength;

      if (
        end >
        pageValues.length
      ) {
        break;
      }

      const windowTokens =
        pageValues.slice(
          start,
          end
        );

      const {
        matches,
        coverage,
        precision,
      } = getTokenOverlap(
        phraseTokens,
        windowTokens
      );

      const orderedCoverage =
        getOrderedCoverage(
          phraseTokens,
          windowTokens
        );

      const {
        weightedCoverage,
      } = getWeightedCoverage(
        phraseTokens,
        windowTokens
      );

      const identifierCoverage =
        getIdentifierCoverage(
          phraseTokens,
          windowTokens
        );

      const lengthSimilarity =
        Math.min(
          phraseTokens.length,
          windowTokens.length
        ) /
        Math.max(
          phraseTokens.length,
          windowTokens.length
        );

      const score =
        weightedCoverage * 0.32 +
        orderedCoverage * 0.28 +
        coverage * 0.14 +
        precision * 0.08 +
        identifierCoverage * 0.13 +
        lengthSimilarity * 0.05;

      const hasIdentifiers =
        phraseTokens.some(
          isIdentifierToken
        );

      const minimumMatches =
        phraseLength <= 4
          ? Math.min(
            2,
            phraseLength
          )
          : Math.max(
            3,
            Math.ceil(
              phraseLength * 0.35
            )
          );

      /*
       * Generic acceptance rules.
       */
      const accepted =
        matches >= minimumMatches &&
        weightedCoverage >=
        (
          hasIdentifiers
            ? 0.48
            : 0.56
        ) &&
        orderedCoverage >=
        (
          phraseLength <= 5
            ? 0.5
            : 0.38
        ) &&
        score >=
        (
          hasIdentifiers
            ? 0.55
            : 0.6
        ) &&
        (
          !hasIdentifiers ||
          identifierCoverage >= 0.65
        );

      if (
        accepted &&
        (
          !bestMatch ||
          score >
          bestMatch.score
        )
      ) {
        bestMatch = {
          start,
          end: end - 1,
          score,
          exact: false,
          matchType: "fuzzy",
          identifierCoverage,
          weightedCoverage,
          priority:
            phraseObject.priority || 1,
        };
      }
    }
  }

  return bestMatch;
};

const highlightMatchingSpans = (
  spans,
  phrases
) => {
  const pageTokens = [];

  spans.forEach(
    (span, spanIndex) => {
      const tokens =
        tokenizePdfText(
          span.textContent || ""
        );

      tokens.forEach((token) => {
        pageTokens.push({
          value: token,
          span,
          spanIndex,
        });
      });
    }
  );

  if (!pageTokens.length) {
    return {
      matched: false,
      firstElement: null,
      matchCount: 0,
    };
  }

  const candidateMatches = [];

  phrases.forEach((phrase) => {
    const range =
      findBestTokenRange(
        pageTokens,
        phrase
      );

    if (!range) {
      return;
    }

    candidateMatches.push({
      ...range,
      phrase,
    });
  });

  /*
   * Best and most-specific matches first.
   */
  candidateMatches.sort(
    (left, right) => {
      const leftLength =
        left.end -
        left.start +
        1;

      const rightLength =
        right.end -
        right.start +
        1;

      return (
        right.priority -
        left.priority ||
        right.score -
        left.score ||
        rightLength -
        leftLength
      );
    }
  );

  const acceptedRanges = [];
  const highlightedSpans =
    new Set();

  let firstElement = null;
  let matchCount = 0;

  candidateMatches.forEach(
    (candidate) => {
      const candidateLength =
        candidate.end -
        candidate.start +
        1;

      const overlappingRange =
        acceptedRanges.find(
          (accepted) => {
            const overlapStart =
              Math.max(
                candidate.start,
                accepted.start
              );

            const overlapEnd =
              Math.min(
                candidate.end,
                accepted.end
              );

            const overlapLength =
              Math.max(
                0,
                overlapEnd -
                overlapStart +
                1
              );

            const smallerLength =
              Math.min(
                candidateLength,
                accepted.end -
                accepted.start +
                1
              );

            return (
              smallerLength > 0 &&
              overlapLength /
              smallerLength >=
              0.75
            );
          }
        );

      /*
       * Highly overlapping generic duplicate
       * match is ignored.
       */
      if (overlappingRange) {
        return;
      }

      acceptedRanges.push({
        start: candidate.start,
        end: candidate.end,
      });

      matchCount += 1;

      for (
        let tokenIndex =
          candidate.start;
        tokenIndex <=
        candidate.end;
        tokenIndex++
      ) {
        const span =
          pageTokens[tokenIndex]
            ?.span;

        if (span) {
          highlightedSpans.add(
            span
          );
        }
      }
    }
  );

  highlightedSpans.forEach(
    (span) => {
      // span.style.background =
      //   "rgb(60, 255, 0)";
      // span.style.background = "#ffff00";

      // span.style.color = "#000";
      // span.style.borderRadius =
      //   "3px";
      // span.style.padding =
      //   "1px 2px";

      // span.style.boxDecorationBreak =
      //   "clone";

      // span.style.webkitBoxDecorationBreak =
      //   "clone";
      span.style.setProperty(
        "background-color",
        "rgba(255, 235, 59, 0.55)",
        "important"
      );

      // Keep the PDF.js text transparent.
      // The original text is already visible on the canvas.
      span.style.setProperty(
        "color",
        "transparent",
        "important"
      );

      span.style.setProperty(
        "border-radius",
        "2px",
        "important"
      );

      span.style.setProperty(
        "padding",
        "0",
        "important"
      );

      span.style.setProperty(
        "box-shadow",
        "0 0 0 1px rgba(255, 193, 7, 0.30)",
        "important"
      );

      span.style.setProperty(
        "box-decoration-break",
        "clone",
        "important"
      );

      span.style.setProperty(
        "-webkit-box-decoration-break",
        "clone",
        "important"
      );

      if (!firstElement) {
        firstElement = span;
      }
    }
  );

  return {
    matched:
      highlightedSpans.size > 0,
    firstElement,
    matchCount,
  };
};

// ==========================================
// PDF HIGHLIGHT HELPER FUNCTIONS END
// ==========================================

const safeText = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => safeText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    const preferredValue =
      value.text ??
      value.Text ??
      value.content ??
      value.Content ??
      value.summary ??
      value.Summary ??
      value.answer ??
      value.Answer ??
      value.message ??
      value.Message ??
      value.name ??
      value.fileName;

    if (
      preferredValue !== undefined &&
      preferredValue !== value
    ) {
      return safeText(preferredValue);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value);
};

const normalizeResultObject = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      summary: "",
      fileName: "",
      pages: [],
      answerPage: 1,
    };
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {
      summary: safeText(value),
      fileName: "",
      pages: [],
      answerPage: 1,
    };
  }

  const summaryValue =
    value.summary ??
    value.Summary ??
    value.answer ??
    value.Answer ??
    value.text ??
    value.Text ??
    value.content ??
    value.Content ??
    value.message ??
    value.Message ??
    "";

  const fileNameValue =
    value.fileName ??
    value.FileName ??
    value.pdfFile ??
    value.PdfFile ??
    value.sourceFile ??
    value.SourceFile ??
    "";

  const pagesValue =
    value.pages ??
    value.Pages ??
    value.page ??
    value.Page ??
    [];

  const answerPageValue =
    value.answerPage ??
    value.AnswerPage ??
    value.page ??
    value.Page ??
    (
      Array.isArray(pagesValue)
        ? pagesValue[0]
        : 1
    );

  return {
    ...value,


    summary: safeText(summaryValue),


    fileName: safeText(fileNameValue),

    pages: pagesValue,

    answerPage:
      Number(answerPageValue) || 1,
  };
};

const normalizeHistoryResults = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }


  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      const parsedValue =
        JSON.parse(trimmedValue);

      return normalizeHistoryResults(
        parsedValue
      );
    } catch {
      return [
        normalizeResultObject(trimmedValue),
      ];
    }
  }


  if (Array.isArray(value)) {
    return value
      .flatMap((item) =>
        normalizeHistoryResults(item)
      )
      .filter(Boolean);
  }

  if (typeof value === "object") {

    if (value.results !== undefined) {
      return normalizeHistoryResults(
        value.results
      );
    }


    if (value.Results !== undefined) {
      return normalizeHistoryResults(
        value.Results
      );
    }


    if (
      value.data &&
      value.data.results !== undefined
    ) {
      return normalizeHistoryResults(
        value.data.results
      );
    }


    if (
      value.response &&
      value.response.results !== undefined
    ) {
      return normalizeHistoryResults(
        value.response.results
      );
    }


    const hasResultMetadata =
      value.summary !== undefined ||
      value.Summary !== undefined ||
      value.fileName !== undefined ||
      value.FileName !== undefined ||
      value.answerPage !== undefined ||
      value.AnswerPage !== undefined ||
      value.pages !== undefined ||
      value.Pages !== undefined ||
      value.page !== undefined ||
      value.Page !== undefined;

    if (
      !hasResultMetadata &&
      value.answer !== undefined &&
      (
        Array.isArray(value.answer) ||
        typeof value.answer === "object"
      )
    ) {
      return normalizeHistoryResults(
        value.answer
      );
    }


    return [
      normalizeResultObject(value),
    ];
  }

  return [
    normalizeResultObject(value),
  ];
};


class ResultCardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      "ResultCard render failed:",
      error,
      errorInfo
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="chatbot-result-summary"
          style={{
            marginTop: "1rem",
            padding: "1rem",
            border:
              "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "10px",
          }}
        >
          Saved answer format is invalid.
          Check browser console for details.
        </div>
      );
    }

    return this.props.children;
  }
}

const ResultCard = React.memo(function ResultCard({
  r: rawResult
  // i,
  // isTyping,
  // typingText
}) {

  const r = normalizeResultObject(rawResult);

  const targetPages = React.useMemo(() => {
    const pages = r.pages ?? r.Pages ?? r.page ?? r.Page ?? [];
    if (Array.isArray(pages)) {
      return pages.map((p) => Number(p)).filter((p) => !Number.isNaN(p) && p > 0);
    }
    if (typeof pages === 'string') {
      return pages
        .split(/[,;\s]+/)
        .map((p) => Number(p.trim()))
        .filter((p) => !Number.isNaN(p) && p > 0);
    }
    if (typeof pages === 'number') {
      return [pages];
    }
    return [];
  }, [r.pages, r.Pages, r.page, r.Page]);


  const answerPage =
    Number(
      r.answerPage ??
      r.AnswerPage ??
      targetPages[0] ??
      1
    ) || 1;

  const activePage = answerPage;

  const pdfContainerRef = useRef(null);
  const highlightRunRef = useRef(0);

  const documentLoadedRef = useRef(false);
  const preparedHighlightKeyRef = useRef("");

  const pdfLoaderRef = useRef(null);
  const pdfViewerLayerRef = useRef(null);

  const [showPdf, setShowPdf] = useState(false);
  const [pdfReadyTick, setPdfReadyTick] = useState(0);

  const [isPdfPreparing, setIsPdfPreparing] =
    useState(false);

  const [isPdfVisible, setIsPdfVisible] =
    useState(false);


  const displayedSummary = React.useMemo(() => {
    const rawSummary = safeText(
      r.summary ??
      r.Summary ??
      ""
    );

    return rawSummary
      .replace(
        /Source:\s*[\s\S]*$/i,
        ""
      )
      .trim();

  }, [r.summary, r.Summary]);

  const highlightSourceText =
    r.highlightText ??
    r.HighlightText ??
    r.evidenceText ??
    r.EvidenceText ??
    r.matchedText ??
    r.MatchedText ??
    r.sourceText ??
    r.SourceText ??
    displayedSummary;

  const highlightPhrases = React.useMemo(
    () => buildHighlightPhrases(highlightSourceText),
    [highlightSourceText]
  );
  const hasValidPdf =
    !!(r.fileName || r.FileName) &&
    (r.fileName || r.FileName) !== "No Match" &&
    !!displayedSummary &&
    displayedSummary.trim() !==
    "Try rephrasing your question or using more specific keywords.";

  const pageNavigationPluginInstance =
    pageNavigationPlugin();

  const defaultLayoutPluginInstance =
    defaultLayoutPlugin();

  const { jumpToPage } =
    pageNavigationPluginInstance;

  const jumpToPageRef = useRef(jumpToPage);

  useEffect(() => {
    jumpToPageRef.current = jumpToPage;
  }, [jumpToPage]);

  const clearCurrentHighlights = useCallback(() => {
    const viewerContainer = pdfContainerRef.current;

    if (!viewerContainer) {
      return;
    }

    viewerContainer
      .querySelectorAll(".rpv-core__text-layer span")
      .forEach((span) => {
        // span.style.background = "";
        // span.style.color = "";
        // span.style.borderRadius = "";
        // span.style.padding = "";
        // span.style.boxDecorationBreak = "";
        // span.style.webkitBoxDecorationBreak = "";
        span.style.removeProperty("background-color");
        span.style.removeProperty("color");
        span.style.removeProperty("border-radius");
        span.style.removeProperty("padding");
        span.style.removeProperty("box-shadow");
        span.style.removeProperty("box-decoration-break");
        span.style.removeProperty("-webkit-box-decoration-break");
      });
  }, []);

  //  const waitForPageTextLayer = useCallback(
  //   async (
  //     viewerContainer,
  //     pageIndex,
  //     runId,
  //     timeoutMilliseconds = 5000
  //   ) => {
  //     const startedAt = Date.now();

  //     while (
  //       Date.now() - startedAt <
  //       timeoutMilliseconds
  //     ) {
  //       if (runId !== highlightRunRef.current) {
  //         return [];
  //       }

  //       const pageLayer = viewerContainer.querySelector(
  //         `[data-testid="core__page-layer-${pageIndex}"]`
  //       );

  //       if (pageLayer) {
  //         const spans = Array.from(
  //           pageLayer.querySelectorAll(
  //             ".rpv-core__text-layer span"
  //           )
  //         );

  //         const hasReadableText = spans.some(
  //           (span) =>
  //             normalizePdfText(
  //               span.textContent || ""
  //             ).length > 0
  //         );

  //         if (spans.length && hasReadableText) {
  //           return spans;
  //         }
  //       }

  //       await wait(150);
  //     }

  //     return [];
  //   },
  //   []
  // );

  const waitForPageTextLayer = useCallback(
    (
      viewerContainer,
      pageIndex,
      runId,
      timeoutMilliseconds = 5000
    ) => {
      return new Promise((resolve) => {
        let completed = false;
        let observer = null;
        let timeoutId = null;
        let settleTimerId = null;

        const getPageSpans = () => {
          if (
            runId !== highlightRunRef.current
          ) {
            return [];
          }

          const pageLayer =
            viewerContainer.querySelector(
              `[data-testid="core__page-layer-${pageIndex}"]`
            );

          if (!pageLayer) {
            return [];
          }

          return Array.from(
            pageLayer.querySelectorAll(
              ".rpv-core__text-layer span"
            )
          );
        };

        const finish = (spans = []) => {
          if (completed) {
            return;
          }

          completed = true;

          if (observer) {
            observer.disconnect();
          }

          if (timeoutId) {
            window.clearTimeout(timeoutId);
          }

          if (settleTimerId) {
            window.clearTimeout(settleTimerId);
          }

          resolve(spans);
        };

        /*
         * PDF.js table text एकाच वेळी तयार करत नाही.
         * शेवटच्या DOM change नंतर 180ms wait करून
         * पूर्ण text layer घ्या.
         */
        const scheduleStableCheck = () => {
          if (settleTimerId) {
            window.clearTimeout(settleTimerId);
          }

          settleTimerId =
            window.setTimeout(() => {
              if (
                runId !==
                highlightRunRef.current
              ) {
                finish([]);
                return;
              }

              const spans = getPageSpans();

              const completePageText =
                normalizePdfText(
                  spans
                    .map(
                      (span) =>
                        span.textContent || ""
                    )
                    .join(" ")
                );

              /*
               * फक्त एक-दोन span मिळाल्यावर resolve
               * करू नका. पूर्ण readable page आवश्यक.
               */
              if (
                spans.length >= 3 &&
                completePageText.length >= 30
              ) {
                finish(spans);
              }
            }, 180);
        };

        observer = new MutationObserver(() => {
          scheduleStableCheck();
        });

        observer.observe(viewerContainer, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        /*
         * Text layer आधीच तयार असू शकते.
         */
        scheduleStableCheck();

        timeoutId = window.setTimeout(() => {
          const spans = getPageSpans();

          finish(spans);
        }, timeoutMilliseconds);
      });
    },
    []
  );
  // const highlightAnswerInPdf = useCallback(
  //   async () => {
  //     const viewerContainer =
  //       pdfContainerRef.current;

  //     if (
  //       !viewerContainer ||
  //       !highlightPhrases.length
  //     ) {
  //       return;
  //     }

  //     const runId =
  //       ++highlightRunRef.current;

  //     clearCurrentHighlights();

  //     const candidatePages = Array.from(
  //       new Set([
  //         activePage,
  //         ...targetPages,
  //       ])
  //     )
  //       .map((page) => Number(page))
  //       .filter(
  //         (page) =>
  //           Number.isFinite(page) &&
  //           page > 0
  //       )
  //       .slice(0, 4);

  //     for (const pageNumber of candidatePages) {
  //       if (runId !== highlightRunRef.current) {
  //         return;
  //       }

  //       const pageIndex = pageNumber - 1;

  //       jumpToPage(pageIndex);

  //       const spans =
  //         await waitForPageTextLayer(
  //           viewerContainer,
  //           pageIndex,
  //           runId,
  //           pageNumber === activePage
  //             ? 6000
  //             : 3500
  //         );

  //       if (runId !== highlightRunRef.current) {
  //         return;
  //       }

  //       if (!spans.length) {
  //         continue;
  //       }

  //       const result =
  //         highlightMatchingSpans(
  //           spans,
  //           highlightPhrases
  //         );

  //       if (result.matched) {
  //         requestAnimationFrame(() => {
  //           result.firstElement?.scrollIntoView({
  //             behavior: "smooth",
  //             block: "center",
  //             inline: "nearest",
  //           });
  //         });

  //         return;
  //       }
  //     }

  //     if (runId === highlightRunRef.current) {
  //       jumpToPage(activePage - 1);
  //     }
  //   },
  //   [
  //     activePage,
  //     targetPages,
  //     highlightPhrases,
  //     jumpToPage,
  //     clearCurrentHighlights,
  //     waitForPageTextLayer,
  //   ]
  // );
  const highlightAnswerInPdf = useCallback(
    async () => {
      const viewerContainer =
        pdfContainerRef.current;

      if (!viewerContainer) {
        return;
      }

      const runId =
        ++highlightRunRef.current;

      let matchFound = false;
      let matchedElement = null;

      try {
        clearCurrentHighlights();

        const candidatePages = Array.from(
          new Set([
            activePage,
            ...targetPages,
          ])
        )
          .map((page) => Number(page))
          .filter(
            (page) =>
              Number.isFinite(page) &&
              page > 0
          )
        //.slice(0, 4);

        if (!highlightPhrases.length) {
          jumpToPageRef.current(
            activePage - 1
          );

          return;
        }

        for (
          const pageNumber of candidatePages
        ) {
          if (
            runId !==
            highlightRunRef.current
          ) {
            return;
          }

          const pageIndex =
            pageNumber - 1;

          /*
           * Viewer initialPage वापरून active page वर
           * आधीच आलेला आहे. पुन्हा jump केल्यास
           * text layer reset होऊ शकते.
           */
          if (pageNumber !== activePage) {
            jumpToPageRef.current(pageIndex);
          }

          const spans =
            await waitForPageTextLayer(
              viewerContainer,
              pageIndex,
              runId,
              pageNumber === activePage
                ? 5000
                : 2500
            );

          if (
            runId !==
            highlightRunRef.current
          ) {
            return;
          }

          if (!spans.length) {
            continue;
          }

          let result =
            highlightMatchingSpans(
              spans,
              highlightPhrases
            );

          if (!result.matched) {
            continue;
          }

          /*
           * दोन browser frames wait करून तपासा की
           * PDF.js ने text layer replace केली नाही.
           */
          await nextAnimationFrame();
          await nextAnimationFrame();

          if (
            runId !==
            highlightRunRef.current
          ) {
            return;
          }

          const latestPageLayer =
            viewerContainer.querySelector(
              `[data-testid="core__page-layer-${pageIndex}"]`
            );

          const latestSpans =
            latestPageLayer
              ? Array.from(
                latestPageLayer.querySelectorAll(
                  ".rpv-core__text-layer span"
                )
              )
              : [];

          /*
           * नवीन text layer तयार झाली असेल तर
           * latest spans वर highlight पुन्हा apply करा.
           */
          if (latestSpans.length > 0) {
            result =
              highlightMatchingSpans(
                latestSpans,
                highlightPhrases
              );
          }

          // if (result.matched) {
          //   matchFound = true;
          //   matchedElement =
          //     result.firstElement;

          //   break;
          // }
          if (result.matched) {
            matchFound = true;

            if (!matchedElement) {
              matchedElement =
                result.firstElement;
            }

            // break करू नका
            // त्यामुळे Answer Page आणि सर्व Related Pages scan होतील
          }
        }

        if (matchFound) {
          // शेवटी Answer Found Page वर या
          jumpToPageRef.current(
            activePage - 1
          );

          const answerPageSpans =
            await waitForPageTextLayer(
              viewerContainer,
              activePage - 1,
              runId,
              3000
            );

          if (answerPageSpans.length > 0) {
            const answerPageResult =
              highlightMatchingSpans(
                answerPageSpans,
                highlightPhrases
              );

            answerPageResult.firstElement
              ?.scrollIntoView({
                behavior: "auto",
                block: "center",
                inline: "nearest",
              });
          }
        }
        else {
          /*
           * Highlight match नसेल तर answer page
           * वर परत या.
           */
          jumpToPageRef.current(
            activePage - 1
          );

          console.warn(
            "PDF highlight text was not matched",
            // {
            //   fileName:
            //     r.fileName || r.FileName,
            //   activePage,
            //   highlightPhrases,
            // }
          );
        }

      } catch (error) {
        console.error(
          "PDF highlight failed:",
          error
        );

        jumpToPageRef.current(
          activePage - 1
        );

      } finally {
        /*
         * इथे setIsPdfVisible किंवा
         * setIsPdfPreparing वापरू नका.
         *
         * State update केल्यास ResultCard render
         * होऊन PDF text layer बदलू शकते.
         */
        await nextAnimationFrame();

        if (
          runId ===
          highlightRunRef.current
        ) {
          if (pdfLoaderRef.current) {
            pdfLoaderRef.current.style.display =
              "none";
          }

          if (pdfViewerLayerRef.current) {
            pdfViewerLayerRef.current.style.opacity =
              "1";

            pdfViewerLayerRef.current.style.pointerEvents =
              "auto";
          }
        }
      }
    },
    [
      activePage,
      targetPages,
      highlightPhrases,
      r.fileName,
      r.FileName,
      clearCurrentHighlights,
      waitForPageTextLayer,
    ]
  );
  // useEffect(() => {
  //   if (!showPdf || !hasValidPdf) {
  //     return undefined;
  //   }

  //   const timer = window.setTimeout(() => {
  //     highlightAnswerInPdf();
  //   }, 100);

  //   return () => {
  //     window.clearTimeout(timer);

  //     highlightRunRef.current += 1;
  //   };
  // }, [
  //   showPdf,
  //   hasValidPdf,
  //   activePage,
  //   pdfReadyTick,
  //   highlightAnswerInPdf,
  // ]);
  useEffect(() => {
    /*
    * PDF document load होण्यापूर्वी
    * highlight सुरू करू नका.
    */
    if (
      !showPdf ||
      !hasValidPdf ||
      pdfReadyTick === 0
    ) {
      return;
    }

    const highlightKey = [
      r.fileName || r.FileName,
      activePage,
      highlightPhrases
        .map((phrase) =>
          phrase.text
        )
        .join("|"),
    ].join("::");

    /*
    * समान PDF highlight process पुन्हा
    * चालवू नका.
    */
    if (
      preparedHighlightKeyRef.current ===
      highlightKey
    ) {
      return;
    }

    preparedHighlightKeyRef.current =
      highlightKey;

    highlightAnswerInPdf();

  }, [
    showPdf,
    hasValidPdf,
    pdfReadyTick,
    activePage,
    highlightPhrases,
    r.fileName,
    r.FileName,
    highlightAnswerInPdf,
  ]);

  useEffect(() => {
    return () => {
      highlightRunRef.current += 1;
    };
  }, []);

  return (
    <div className="chatbot-result-card">
      <div className="chatbot-result-card-header">
        <div className="chatbot-result-label">
          {/* <span>Answer</span> */}
        </div>

        {(r.avgScore !== undefined ||
          r.AvgScore !== undefined) && (

            <div className="chatbot-score-badge">

              Score: {(
                (
                  r.avgScore ??
                  r.AvgScore ??
                  0
                ) * 100
              ).toFixed(0)}%

            </div>

          )}
      </div>

      <div className="chatbot-result-summary" style={{ marginTop: '1rem', whiteSpace: 'pre-line' }}>
        {/* {i === 0 && isTyping ? (
          <span className="chatbot-typing-text">
            {typingText}
            <span className="chatbot-cursor">|</span>
          </span>
          ) : (
          displayedSummary || "No answer available"
          )} */}
        {displayedSummary || "No answer available"}
      </div>

      {hasValidPdf && (
        <div className="chatbot-result-source">
          <span className="chatbot-result-source-label"></span>
          <span className="chatbot-result-source-text">
            Answer found on Page {answerPage}

            {targetPages.length > 1 && (
              <>
                {" "} | Related Pages: {targetPages.join(", ")}
              </>
            )}

            {" "} | PDF file: {r.fileName || r.FileName}

            {/* <button
              className="chatbot-source-view-icon"
              onClick={() => setShowPdf(!showPdf)}
              aria-label="View PDF"
            >
              &gt;
            </button> */}
            <button
              type="button"
              className="chatbot-source-view-icon"
              onClick={() => {
                // PDF close
                if (showPdf) {
                  highlightRunRef.current += 1;

                  setShowPdf(false);
                  setPdfReadyTick(0);
                  setIsPdfPreparing(false);
                  setIsPdfVisible(false);

                  documentLoadedRef.current = false;
                  preparedHighlightKeyRef.current = "";

                  return;
                }

                // PDF open
                highlightRunRef.current += 1;

                documentLoadedRef.current = false;
                preparedHighlightKeyRef.current = "";

                setPdfReadyTick(0);
                setIsPdfVisible(false);
                setIsPdfPreparing(true);
                setShowPdf(true);
              }}
              aria-label={
                showPdf ? "Close PDF" : "View PDF"
              }
            >
              &gt;
            </button>
          </span>
        </div>
      )}

      {/* {showPdf && hasValidPdf && (
        <div ref={pdfContainerRef} className="chatbot-result-pdf" style={{ maxHeight: '420px', height: '420px', overflow: 'hidden', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '18px', marginTop: '1rem' }}>
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js"> */}
      {/* <Viewer
              key={`${r.fileName || r.FileName}-${activePage}`}
              fileUrl={getPdf(r.fileName || r.FileName)}
              plugins={[defaultLayoutPluginInstance, highlightPluginInstance, textExtractionPlugin]}
              initialPage={activePage > 0 ? activePage - 1 : 0}
            /> */}
      {/* <Viewer
          key={`${r.fileName || r.FileName}-${activePage}`}
          fileUrl={getPdf(r.fileName || r.FileName)}
          plugins={[
            defaultLayoutPluginInstance,
            pageNavigationPluginInstance
          ]}
          initialPage={
            activePage > 0
              ? activePage - 1
              : 0
          }
          onDocumentLoad={() => {
            setPdfReadyTick((current) => current + 1);
          }}
        />
          </Worker>
        </div>
      )} */}

      {showPdf && hasValidPdf && (
        <div
          ref={pdfContainerRef}
          className="chatbot-result-pdf"
          style={{
            position: "relative",
            maxHeight: "420px",
            height: "420px",
            overflow: "hidden",
            border:
              "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "18px",
            marginTop: "1rem",
            background: "#0f1117",
          }}
        >
          {/* PDF + highlight तयार होईपर्यंत loader */}
          {isPdfPreparing &&
            !isPdfVisible && (
              <div
                ref={pdfLoaderRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 50,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "12px",
                  background: "#0f1117",
                  color: "#cbd5e1",
                }}
              >
                <div
                  className="pdf-highlight-loader"
                />

                <span>
                  Preparing page...
                </span>
              </div>
            )}


          <div
            ref={pdfViewerLayerRef}
            style={{
              width: "100%",
              height: "100%",
              opacity: 0,
              pointerEvents: "none",
              transition: "opacity 0.05s linear",
            }}
          >
            <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
              <Viewer
                key={`${r.fileName || r.FileName
                  }-${activePage}`}
                fileUrl={getPdf(
                  r.fileName || r.FileName
                )}
                plugins={[
                  defaultLayoutPluginInstance,
                  pageNavigationPluginInstance,
                ]}
                initialPage={
                  activePage > 0
                    ? activePage - 1
                    : 0
                }
                onDocumentLoad={() => {
                  if (
                    documentLoadedRef.current
                  ) {
                    return;
                  }

                  documentLoadedRef.current = true;

                  setPdfReadyTick(
                    (current) => current + 1
                  );
                }}
              />
            </Worker>
          </div>
        </div>
      )}
    </div>
  );
});

const Chatbot = () => {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [typingText, setTypingText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(sessionStorage.getItem("chatSessionId") || "");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  //const [chatHistory, setChatHistory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef(null);
  const chatScrollRef = useRef(null);


  const placeholders = React.useMemo(() => [
    "Ask me anything about your documents...",
    "Search across all your PDFs...",
    "What would you like to know?",
    "Type your question here..."
  ], []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholder, setPlaceholder] = useState("");
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      window.location.href = "/";
    }
  }, []);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "52px";
    }
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await getChatHistory();

      console.log("History API Response:", data); // debug


      //setSessions(data.sessions || []);
      setSessions(
        Array.isArray(data?.sessions)
          ? data.sessions
          : []
      );

    } catch (err) {
      console.error("Failed to load chat history", err);
      // setChatHistory([]);
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      fetchHistory();
    }
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      // chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
      chatScrollRef.current.scrollTop =
        chatScrollRef.current.scrollHeight;
    }
  }, [conversation]);

  useEffect(() => {
    const current = placeholders[placeholderIdx];
    let timeout;

    if (!isDeleting && charIdx <= current.length) {
      timeout = setTimeout(() => {
        setPlaceholder(current.slice(0, charIdx));
        setCharIdx(charIdx + 1);
      }, 50);
    } else if (!isDeleting && charIdx > current.length) {
      timeout = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && charIdx > 0) {
      timeout = setTimeout(() => {
        setPlaceholder(current.slice(0, charIdx - 1));
        setCharIdx(charIdx - 1);
      }, 30);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setPlaceholderIdx((placeholderIdx + 1) % placeholders.length);
    }

    return () => clearTimeout(timeout);
  }, [charIdx, isDeleting, placeholderIdx, placeholders]);

  const ask = async (e) => {
    e?.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setIsTyping(false);
    setTypingText("");
    const currentQuestion = question;

    setPendingQuestion(currentQuestion);

    setQuestion("");
    try {
      const data = await askQuestion(question, sessionId, includeHistory);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("chatSessionId", data.sessionId);
        setConversation([]);
      }

      // const responseResults = data.results || [];
      const responseResults =
        normalizeHistoryResults(
          data?.results ?? []
        );
      const currentQuestion = question;
      setPendingQuestion(currentQuestion);
      setQuestion("");

      setConversation((prev) => [
        ...prev,
        {
          question: currentQuestion,
          results: responseResults,
          askedAt: new Date().toISOString(),
        },
      ]);
      setPendingQuestion(null);
      await fetchHistory();

      setIsTyping(false);
      setTypingText("");
    } catch (err) {
      console.error("Failed to ask question", err);
      setPendingQuestion(null);
      setIsTyping(false);
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setConversation([]);
    setSessionId("");
    sessionStorage.removeItem("chatSessionId");
    setQuestion("");
  };


  return (
    <div className="chatbot-page">
      {/* Sidebar Overlay */}
      {sidebarOpen && <div className="chatbot-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* History Sidebar */}
      <aside className={`chatbot-sidebar ${sidebarOpen ? 'chatbot-sidebar-open' : ''}`}>
        <div className="chatbot-sidebar-header">
          <div className="chatbot-sidebar-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Recent</span>
          </div>
          <button
            className="chatbot-sidebar-new-chat"
            onClick={startNewChat}
            aria-label="Start new chat"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              width: '36px',
              height: '36px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px',
              transition: 'background 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="18"
              height="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>

        </div>

        <div className="chatbot-sidebar-content" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>

          {historyLoading ? (
            <div className="chatbot-sidebar-loading">
              <div className="chatbot-typing-dots">
                <span></span><span></span><span></span>
              </div>
              <p>Loading history...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="chatbot-sidebar-empty">
              <p>No chat history yet</p>
            </div>
          ) : (
            (Array.isArray(sessions) ? sessions : []).map(
              (session) => (
                <button type="button"
                  key={session.sessionId}
                  className={`chatbot-sidebar-item ${session.sessionId === sessionId ? "active" : ""}`}

                  onClick={() => {
                    try {
                      setSidebarOpen(false);

                      setLoading(false);
                      setPendingQuestion(null);
                      setIsTyping(false);
                      setTypingText("");

                      setSessionId(session.sessionId);

                      sessionStorage.setItem(
                        "chatSessionId",
                        session.sessionId
                      );


                      let sessionMessages = session.messages;

                      if (typeof sessionMessages === "string") {
                        try {
                          sessionMessages =
                            JSON.parse(sessionMessages);
                        } catch (parseError) {
                          console.error(
                            "Unable to parse session messages:",
                            parseError
                          );

                          sessionMessages = [];
                        }
                      }

                      if (!Array.isArray(sessionMessages)) {
                        sessionMessages = [];
                      }

                      const parsedConversation =
                        sessionMessages
                          .map((msg, messageIndex) => {
                            const rawAnswer =
                              msg?.answer ??
                              msg?.results ??
                              msg?.response ??
                              [];

                            const normalizedResults =
                              normalizeHistoryResults(rawAnswer);

                            return {
                              question:
                                safeText(
                                  msg?.question ??
                                  msg?.Question ??
                                  `Saved Question ${messageIndex + 1}`
                                ) ||
                                `Saved Question ${messageIndex + 1}`,

                              results: normalizedResults,

                              askedAt:
                                msg?.askedAt ??
                                msg?.createdAt ??
                                msg?.CreatedAt ??
                                new Date().toISOString(),
                            };
                          })
                          .filter(
                            (message) =>
                              message.question ||
                              message.results.length > 0
                          );

                      console.log(
                        "Parsed old conversation:",
                        parsedConversation
                      );

                      setConversation(parsedConversation);

                      window.setTimeout(() => {
                        if (chatScrollRef.current) {
                          chatScrollRef.current.scrollTop =
                            chatScrollRef.current.scrollHeight;
                        }
                      }, 100);


                    } catch (error) {
                      console.error(
                        "Failed to open old conversation:",
                        error
                      );


                      setConversation([]);
                    }
                  }}
                >
                  <span className="chatbot-sidebar-item-text">
                    {session.title || "New Chat"}
                  </span>
                </button>
              ))

          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="chatbot-main">
        {/* Header */}
        <div className="chatbot-header">
          <button className="chatbot-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle chat history">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="chatbot-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div className="chatbot-header-pulse"></div>
          </div>
          <div className="chatbot-header-info">
            <h1>SmartAI Assistant</h1>
            <p>Ask questions about your documents and get instant answers</p>
          </div>
        </div>

        <div className="chatbot-chat-area">

          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto'
            }}
          >

            {/* EMPTY STATE */}
            {conversation.length === 0 && !loading && (
              <div className="chatbot-empty-chat">
                <p>How can I assist you today?</p>
                <span>Ask a question to begin the conversation.</span>
              </div>
            )}

            {/* EXISTING CONVERSATIONS */}
            {conversation.map((item, msgIndex) => (

              <div
                key={msgIndex}
                className="chatbot-message-block"
              >

                <div className="chatbot-message-header">

                  <span
                    className="chatbot-message-label"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    Q{msgIndex + 1}
                  </span>

                  <div
                    className="chatbot-message-text"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    {safeText(item.question)}
                  </div>

                </div>

                <div className="chatbot-answer-block">

                  <div className="chatbot-answer-meta">

                    <span className="chatbot-answer-label">
                      Answer
                    </span>

                    <span className="chatbot-answer-time">
                      {new Date(item.askedAt).toLocaleString()}
                    </span>

                  </div>

                  <div className="chatbot-answer-divider" />

                  <div className="chatbot-answer-cards">

                    {/* {item.results.map((r, i) => {

                      const key = `${msgIndex}-${i}`;

                      return (
                        <ResultCard
                          key={key}
                          r={r}
                          i={i}
                          isTyping={
                            isTyping &&
                            msgIndex === conversation.length - 1
                          }
                          typingText={typingText}
                        />
                      );

                    })} */}
                    {Array.isArray(item.results) &&
                      item.results.filter(Boolean).length > 0 ? (

                      item.results
                        .filter(Boolean)
                        .map((r, i) => {

                          //const key = `${msgIndex}-${i}`;

                          return (
                            <ResultCardErrorBoundary
                              key={`${sessionId}-${msgIndex}-${i}`}
                            >
                              <ResultCard
                                r={r}
                                i={i}
                                isTyping={
                                  isTyping &&
                                  msgIndex ===
                                  conversation.length - 1
                                }
                                typingText={typingText}
                              />
                            </ResultCardErrorBoundary>
                          );

                        })

                    ) : (

                      <div
                        className="chatbot-result-summary"
                        style={{
                          marginTop: "1rem",
                          padding: "1rem",
                        }}
                      >
                        Saved answer could not be loaded.
                      </div>

                    )}

                  </div>

                </div>

              </div>

            ))}

            {/* PENDING LOADER */}
            {loading && pendingQuestion && (

              <div className="chatbot-message-block">

                <div className="chatbot-message-header">

                  <span
                    className="chatbot-message-label"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    Q{conversation.length + 1}
                  </span>

                  <div
                    className="chatbot-message-text"
                    style={{
                      display: "flex",
                      justifyContent: "flex-end"
                    }}
                  >
                    {pendingQuestion}
                  </div>

                </div>

                <div className="chatbot-loading">

                  <div className="chatbot-typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>

                  <p>Searching</p>

                </div>

              </div>

            )}

          </div>

        </div>

        <div className="chatbot-input-fixed">
          <form onSubmit={ask} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '100%', margin: '0 auto' }}>
            <div className="chatbot-input-wrap" style={{ position: 'relative' }}>
              {/* <textarea
                ref={inputRef}
                className="chatbot-textarea"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={placeholder + "|"}
                rows={3}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                style={{ paddingRight: '3rem' }}
              /> */}
              <textarea
                ref={inputRef}
                className="chatbot-textarea"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);

                  // 🔥 Auto height adjust
                  const textarea = e.target;

                  textarea.style.height = "auto";

                  // max height limit
                  const maxHeight = 140;

                  if (textarea.scrollHeight <= maxHeight) {
                    textarea.style.height = textarea.scrollHeight + "px";
                    textarea.style.overflowY = "hidden";
                  } else {
                    textarea.style.height = maxHeight + "px";
                    textarea.style.overflowY = "auto";
                  }
                }}
                placeholder={placeholder + "|"}
                rows={1}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                style={{
                  paddingRight: '3rem',
                  minHeight: '52px',
                  maxHeight: '140px',
                  resize: 'none',
                  overflowY: 'hidden',
                  lineHeight: '1.5',
                }}
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  bottom: '0.75rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4b5563'
                }}
                aria-label="Send question"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                  <path d="M5 12h14" />
                  <path d="M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Press Enter to send, Shift+Enter for new line</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  disabled={loading}
                />
                Include Conversation Context
              </label>
            </div> */}
            <div className="chatbot-input-bottom">
              <div className="chatbot-context-checkbox">
                <input
                  type="checkbox"
                  id="includeHistory"
                  checked={includeHistory}
                  onChange={(e) => setIncludeHistory(e.target.checked)}
                  disabled={loading}
                />

                <label htmlFor="includeHistory">
                  Include Conversation Context
                </label>
              </div>

              <div className="chatbot-input-hint">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
          </form>
        </div>
      </div>{/* end chatbot-main */}
    </div>
  );
};

export default Chatbot;