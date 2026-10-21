// Test-only answers; callers run against isolated temporary saves.
export async function completeTaskFeedback(page){
 const dialog=page.locator('.guild-task-feedback[open]');if(!await dialog.count())return;
 await dialog.locator('[name="difficulty"]').selectOption('3');await dialog.locator('[name="hardPart"]').selectOption('tests');await dialog.locator('[name="hintSource"]').selectOption('none');
 await dialog.locator('[type="submit"]').click();await dialog.waitFor({state:'detached'});
}
