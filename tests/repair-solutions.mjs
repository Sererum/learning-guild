// Teacher-only fixtures. Never served to the student.
export const repairSolutions={
 'repair-clean-1':'clean_name = raw_name.strip().lower()\nprint(raw_name, clean_name)',
 'repair-clean-2':'clean_email = raw_email.strip().lower()\nis_ru = clean_email.endswith(".ru")\nprint(clean_email, is_ru)',
 'repair-clean-3':'clean_text = text.strip().lower()\nneeds_delivery = "доставка" in clean_text or "доставку" in clean_text\nprint(clean_text, needs_delivery)',
 'repair-index-1':'if name:\n    last_letter = name[-1]\nelse:\n    last_letter = ""\nprint(last_letter)',
 'repair-index-2':'marker_index = message.find(marker)\nif marker_index != -1:\n    suffix = message[marker_index + len(marker):]\nelse:\n    suffix = "нет маркера"\nprint(marker_index, suffix)',
 'repair-index-3':'at_index = email.find("@")\nif at_index != -1:\n    domain = email[at_index + 1:]\nelse:\n    domain = "нет домена"\nprint(at_index, domain)',
 'repair-for-1':'total_topups = 0\nfor topup in topups:\n    total_topups += topup\nprint(total_topups)',
 'repair-for-2':'eligible_count = 0\nfor order in orders:\n    if order >= limit:\n        eligible_count += 1\nprint(eligible_count)',
 'repair-for-3':'eligible_total = 0\nfor order in orders:\n    if order >= limit:\n        eligible_total += order\nprint(eligible_total)',
 'repair-accumulator-1':'total_tips = 0\ntip_count = 0\nfor tip in tips:\n    total_tips += tip\n    tip_count += 1\nprint(total_tips, tip_count)',
 'repair-accumulator-2':'large_revenue = 0\nlarge_count = 0\nfor order in orders:\n    if order >= limit:\n        large_revenue += order\n        large_count += 1\nprint(large_revenue, large_count)',
 'repair-accumulator-3':'revenue = 0\norder_count = 0\nlarge_count = 0\nfor order in orders:\n    revenue += order\n    order_count += 1\n    if order >= limit:\n        large_count += 1\nif large_count > 0:\n    decision = "были крупные заказы"\nelse:\n    decision = "крупных заказов нет"\nprint(revenue, order_count, large_count, decision)',
 'repair-while-1':'while progress < goal:\n    progress += 1\nprint(progress)',
 'repair-while-2':'days = 0\nwhile saved < goal:\n    saved += daily_add\n    days += 1\nprint(saved, days)',
 'repair-while-3':'while bought < goal and balance - price >= reserve:\n    balance -= price\n    bought += 1\nif bought >= goal:\n    reason = "план выполнен"\nelse:\n    reason = "недостаточно денег с резервом"\nprint(balance, bought, reason)',
 'repair-keys':'previous_stock = stock[product]\nstock[product] = previous_stock + added_units\nupdated_stock = stock[product]\nprint(previous_stock, updated_stock, stock)',
 'repair-safe-get':'found_price = prices.get(product, "нет в каталоге")\nsize_after_read = len(prices)\nprint(found_price, size_after_read)',
 'repair-frequency':'source_counts = {}\nfor source in lead_sources:\n    source_counts[source] = source_counts.get(source, 0) + 1\nlead_count = len(lead_sources)\nprint(source_counts, lead_count)',
 'repair-unique':'unique_customers = set(customers)\nunique_customer_count = len(unique_customers)\nrequest_count = len(customers)\nprint(unique_customer_count, request_count)'
};
