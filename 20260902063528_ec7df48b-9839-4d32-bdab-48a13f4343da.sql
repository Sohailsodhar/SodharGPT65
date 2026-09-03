CREATE POLICY "Users can upload to own generated-images folder"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own generated-images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role can manage generated-images"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'generated-images')
    WITH CHECK (bucket_id = 'generated-images');

CREATE POLICY "Users can upload to own payment-screenshots folder"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'payment-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own payment-screenshots"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'payment-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can read all payment-screenshots"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'payment-screenshots' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage payment-screenshots"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'payment-screenshots')
    WITH CHECK (bucket_id = 'payment-screenshots');