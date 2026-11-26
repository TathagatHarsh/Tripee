-- The WhatsApp message id (wamid) Meta returns for each sent message, so a reply
-- that quotes one of our messages (an admin replying "1000" to a custom-cake
-- request) can be matched to it. Additive only: safe to apply before the code
-- that writes it is deployed; the code must not be deployed before it.
ALTER TABLE "NotificationOutbox" ADD COLUMN "providerMessageId" TEXT;

CREATE INDEX "NotificationOutbox_providerMessageId_idx" ON "NotificationOutbox"("providerMessageId");
