from django.test import SimpleTestCase

from apps.core.text import (
    clean_national_id,
    clean_text,
    mask_national_id,
    national_id_is_valid,
    national_id_variants,
)

from .helpers import make_national_id


class NationalIdTests(SimpleTestCase):
    def test_generated_ids_are_valid(self):
        for seed in (1, 12345678, 98765432, 11112222):
            self.assertTrue(national_id_is_valid(make_national_id(seed)), seed)

    def test_rejects_wrong_check_digit(self):
        valid = make_national_id(12345678)
        wrong = valid[:9] + str((int(valid[9]) + 1) % 10)
        self.assertFalse(national_id_is_valid(wrong))

    def test_rejects_repeated_digits(self):
        self.assertFalse(national_id_is_valid("0000000000"))
        self.assertFalse(national_id_is_valid("1111111111"))

    def test_rejects_short_and_non_numeric(self):
        self.assertFalse(national_id_is_valid("123"))
        self.assertFalse(national_id_is_valid("12345678a0"))

    def test_normalizes_persian_digits_and_pads(self):
        self.assertEqual(clean_national_id("۱۲۳۴۵۶۷۸۹۰"), "1234567890")
        self.assertEqual(clean_national_id("0451234567"), "0451234567")
        self.assertEqual(clean_national_id("451234567"), "0451234567")

    def test_mask_never_leaks_full_id(self):
        masked = mask_national_id("0012345678")
        self.assertEqual(masked, "******5678")
        self.assertNotIn("001234", masked)

    def test_excel_numeric_cell_is_not_corrupted(self):
        self.assertEqual(clean_national_id(451234567.0), "0451234567")
        self.assertEqual(clean_national_id("451234567.0"), "0451234567")
        self.assertEqual(clean_national_id("451234567"), "0451234567")

    def test_variants_cover_with_and_without_the_leading_zero(self):
        variants = national_id_variants("451234567")
        self.assertIn("451234567", variants)
        self.assertIn("0451234567", variants)


class TextTests(SimpleTestCase):
    def test_clean_text_removes_zwnj_and_spaces(self):
        self.assertEqual(clean_text("  علی\u200cرضا  "), "علیرضا")

    def test_clean_text_ascii_digits(self):
        self.assertEqual(clean_text("۱۴۰۵"), "1405")
