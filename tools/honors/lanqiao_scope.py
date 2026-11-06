"""The workshop's Lanqiao scope: algorithm subjects in university group B."""

import re


def is_workshop_lanqiao_category(category):
    category = re.sub(r"\s+", "", category)
    return bool(re.fullmatch(r"(?:C/C\+\+程序设计|Java软件开发|Python程序设计)大学B组", category))
