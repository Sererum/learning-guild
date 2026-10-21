// Teacher-only fixtures. Never send this module to the browser.
export const algorithmSolutions = {
'algo-max-1': `best_sale = sales[0]
for sale in sales:
    if sale > best_sale:
        best_sale = sale
print('Лучшая выручка:', best_sale)`,
'algo-max-2': `best_views = views[0]
best_index = 0
for index in range(len(views)):
    if views[index] > best_views:
        best_views = views[index]
        best_index = index
print('Просмотры:', best_views, 'индекс:', best_index)`,
'algo-max-3': `best_change = None
for change in profit_changes:
    if change >= min_change:
        if best_change is None or change < best_change:
            best_change = change
if best_change is None:
    print('Подходящих значений нет')
else:
    print('Лучшее изменение:', best_change)`,
'algo-substring-1': `window_count = 0
last_window = ''
for start in range(len(text) - len(marker) + 1):
    window_count += 1
    last_window = text[start:start + len(marker)]
print('Окон:', window_count, 'последнее:', last_window)`,
'algo-substring-2': `clean_text = raw_text.strip().lower()
first_index = -1
for start in range(len(clean_text) - len(marker) + 1):
    if clean_text[start:start + len(marker)] == marker:
        first_index = start
        break
print('Текст:', clean_text, 'первое начало:', first_index)`,
'algo-substring-3': `positions = []
for start in range(len(text) - len(marker) + 1):
    if text[start:start + len(marker)] == marker:
        positions.append(start)
print('Позиции:', positions, 'всего:', len(positions))`,
'algo-pointers-1': `left = 0
right = len(labels) - 1
pairs_checked = 0
matching_pairs = 0
while left < right:
    pairs_checked += 1
    if labels[left] == labels[right]:
        matching_pairs += 1
    left += 1
    right -= 1
print('Проверено:', pairs_checked, 'совпало:', matching_pairs)`,
'algo-pointers-2': `code_text = raw_code.strip().lower()
left = 0
right = len(code_text) - 1
is_palindrome = True
while left < right:
    if code_text[left] != code_text[right]:
        is_palindrome = False
        break
    left += 1
    right -= 1
print('Код:', code_text, 'зеркальный:', is_palindrome)`,
'algo-pointers-3': `left = 0
right = len(prices) - 1
pair_found = False
pair_prices = []
while left < right:
    total = prices[left] + prices[right]
    if total == target:
        pair_found = True
        pair_prices = [prices[left], prices[right]]
        break
    elif total < target:
        left += 1
    else:
        right -= 1
print('Найдена:', pair_found, 'цены:', pair_prices)`,
'algo-final': `peak_revenue = revenues[0]
peak_index = 0
for index in range(len(revenues)):
    if revenues[index] > peak_revenue:
        peak_revenue = revenues[index]
        peak_index = index
campaign_name = raw_campaign.strip().lower()
marker_index = campaign_name.find(marker)
left = 0
right = len(prices) - 1
pair_found = False
pair_prices = []
while left < right:
    total = prices[left] + prices[right]
    print('Адреса:', left, right, 'сумма:', total)
    if total == gift_budget:
        pair_found = True
        pair_prices = [prices[left], prices[right]]
        break
    elif total < gift_budget:
        left += 1
    else:
        right -= 1
decision = 'нужна проверка'
if marker_index != -1 and pair_found:
    decision = 'готово'
print('Кампания:', campaign_name)
print('Рекорд:', peak_revenue, 'день:', peak_index + 1)
print('Позиция маркера:', marker_index)
if pair_found:
    print('Пара подарков:', pair_prices)
else:
    print('Подходящей пары нет')
print('Решение:', decision)`
};
