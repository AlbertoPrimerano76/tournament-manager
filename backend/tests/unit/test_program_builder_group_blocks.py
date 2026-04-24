from app.services.program_builder import _ordered_group_block_rounds


def test_group_blocks_orders_lower_single_final_before_7_8_final():
    carry_matches = [
        ("Piazzamento 1-4", 1, 4, [{"label": "1A"}, {"label": "2A"}, {"label": "1B"}, {"label": "2B"}]),
        ("Piazzamento 5-8", 5, 8, [{"label": "3A"}, {"label": "4A"}, {"label": "3B"}, {"label": "4B"}]),
        ("Piazzamento 9-10", 9, 10, [{"label": "5A"}, {"label": "5B"}]),
    ]

    rounds = _ordered_group_block_rounds(carry_matches)
    labels_in_order = [round_name for _, round_name, _ in rounds]
    orders_by_label = {round_name: order for order, round_name, _ in rounds}

    assert labels_in_order == [
        "Piazzamento 1-4 · Semifinali",
        "Piazzamento 5-8 · Semifinali",
        "Piazzamento 9-10 · Finale",
        "Piazzamento 7-8 · Finale",
        "Piazzamento 5-6 · Finale",
        "Piazzamento 3-4 · Finale",
        "Piazzamento 1-2 · Finale",
    ]
    assert orders_by_label["Piazzamento 9-10 · Finale"] < orders_by_label["Piazzamento 7-8 · Finale"]
