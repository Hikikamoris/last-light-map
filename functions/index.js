const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

initializeApp();
setGlobalOptions({ region: "europe-west3", maxInstances: 4 });
const db = getFirestore();

function actionFor(before, after) {
  if (!before.exists && after.exists) return "создал";
  if (before.exists && !after.exists) return "удалил";
  return "изменил";
}

async function journalWrite(event, entityType, actorField, titleField) {
  const before = event.data.before;
  const after = event.data.after;
  const oldData = before.exists ? before.data() : {};
  const newData = after.exists ? after.data() : {};
  const data = Object.keys(newData).length ? newData : oldData;
  const actorUid = (data.status === "pending" ? data.submittedBy : null) ||
    data.reviewedBy || data.updatedBy || data[actorField] || event.params.uid || data.uid || "unknown";
  const actorSnap = actorUid === "unknown" ? null : await db.doc(`users/${actorUid}`).get();
  const actorName = actorSnap?.exists ? actorSnap.data().displayName : "Пользователь";
  const title = entityType === "роль пользователя"
    ? `Роль: ${oldData.role || "?"} → ${newData.role || "?"}`
    : String(data[titleField] || data.squadName || data.text || "").trim().slice(0, 100);
  await db.collection("journal").add({
    actorUid,
    actorName: actorName || "Пользователь",
    action: actionFor(before, after),
    entityType,
    entityId: event.params.uid || event.params.postId || event.params.orderId || event.params.commentId || event.params.document || "",
    summary: title || entityType,
    createdAt: FieldValue.serverTimestamp()
  });
}

exports.logUserRegistration = onDocumentWritten("users/{uid}", async (event) => {
  const before = event.data.before;
  const after = event.data.after;
  if (!before.exists && after.exists) {
    const user = after.data();
    await db.collection("journal").add({
      actorUid: event.params.uid,
      actorName: user.displayName || "Игрок",
      action: "зарегистрировался",
      entityType: "account",
      entityId: event.params.uid,
      summary: "Создан аккаунт игрока через Google",
      createdAt: FieldValue.serverTimestamp()
    });
  } else if (before.exists && after.exists && before.data().role !== after.data().role) {
    await journalWrite(event, "роль пользователя", "updatedBy", "role");
  } else {
    await journalWrite(event, "учётная запись", "uid", "displayName");
  }
});

exports.logApplication = onDocumentWritten("applications/{uid}", (event) =>
  journalWrite(event, "заявка на отряд", "applicantUid", "squadName"));
exports.logPost = onDocumentWritten("posts/{postId}", (event) =>
  journalWrite(event, "пост на стене", "authorUid", "text"));
exports.logOrder = onDocumentWritten("orders/{orderId}", (event) =>
  journalWrite(event, "приказ", "authorUid", "text"));
exports.logPublicData = onDocumentWritten("public/{document}", (event) =>
  journalWrite(event, `общие данные: ${event.params.document}`, "updatedBy", "title"));
exports.logComment = onDocumentWritten("posts/{postId}/comments/{commentId}", (event) =>
  journalWrite(event, "комментарий", "authorUid", "text"));
exports.logReaction = onDocumentWritten("posts/{postId}/reactions/{uid}", (event) =>
  journalWrite(event, "реакция на пост", "authorUid", "value"));
