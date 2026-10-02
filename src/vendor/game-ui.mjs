// Generated from primeqk_online/client-common/app.js; DO NOT EDIT.
function cardButton(card, options = {}) {
  const btn = document.createElement(options.staticOnly ? "div" : "button");
  btn.className = `playing-card ${isRedSuit(card.suit) ? "red" : ""}`;
  if (options.field) btn.classList.add("field-card");
  if (!options.staticOnly) btn.type = "button";
  const suit = document.createElement("span");
  suit.className = "suit";
  suit.textContent = suitLabel(card);
  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = rankLabel(card);
  btn.append(suit, rank);
  return btn;
}

function suitLabel(card) {
  if (isJoker(card)) return "☆";
  return { H: "♥", D: "♦", S: "♠", C: "♣" }[card.suit] || card.suit || "";
}

function rankLabel(card) {
  if (isJoker(card)) return "X";
  return { 1: "A", 10: "T", 11: "J", 12: "Q", 13: "K" }[Number(card.rank)] || String(card.rank);
}

function isJoker(card) {
  return card?.is_joker || card?.suit === "X";
}

function isRedSuit(suit) {
  return suit === "H" || suit === "D";
}

function compositeSyntaxError(tokens, cards, assigned) {
  if (!tokens.some((token) => token.kind === "op")) {
    return "素因数分解には積または指数が最低1つ必要です。";
  }
  const byId = new Map(cards.map((card) => [card.card_id, card]));
  let number = "";
  let jokerIndex = 0;
  let afterPower = false;
  const checkNumber = () => {
    if (!number) return "演算子の前後に材料札が必要です。";
    if (number.startsWith("0")) return "最上位桁が0の数は作れません。";
    if (number === "1") {
      return afterPower ? "指数は途中も含めてすべて2以上にしてください。" : "底が0または1は不可です。";
    }
    return "";
  };
  for (const token of tokens) {
    if (token.kind === "card") {
      const card = byId.get(token.card_id);
      if (!card) return "未知のカードが式に含まれています。";
      number += String(card.is_joker ? assigned[jokerIndex++] : card.rank);
    } else if (token.kind === "op" && (token.op === "×" || token.op === "^")) {
      const error = checkNumber();
      if (error) return error;
      number = "";
      afterPower = token.op === "^";
    } else {
      return "合成数の式に不正な演算子があります。";
    }
  }
  return checkNumber();
}
export {cardButton,suitLabel,rankLabel,isJoker,isRedSuit,compositeSyntaxError};
