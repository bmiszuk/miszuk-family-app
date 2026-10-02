export function maintenanceDeletionConfirmation(attachmentCount){
 return attachmentCount>0?'Remove entry? Attached files will be permanently deleted.':'Remove this entry?';
}
