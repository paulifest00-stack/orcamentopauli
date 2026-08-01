DELETE FROM public.quote_items WHERE quote_id IN (SELECT q.id FROM public.quotes q JOIN public.stores s ON s.id = q.store_id WHERE s.name ILIKE '%moda fantasy%');
DELETE FROM public.quotes WHERE store_id IN (SELECT id FROM public.stores WHERE name ILIKE '%moda fantasy%');
DELETE FROM public.stores WHERE name ILIKE '%moda fantasy%';