import math

from common import haversine_m
from hexgrid import SIZE_M, cell_boundary, cell_center, grid_disk, latlng_to_cell, latlng_to_cells


def test_center_maps_back_to_same_cell():
    cell = latlng_to_cell(25.0478, 121.517)
    assert latlng_to_cell(*cell_center(cell)) == cell


def test_center_to_vertex_is_size():
    cell = latlng_to_cell(25.0478, 121.517)
    c = cell_center(cell)
    for v in cell_boundary(cell):
        assert abs(float(haversine_m(c[0], c[1], v[0], v[1])) - SIZE_M) < 1


def test_hexagon_is_upright_pointy_top():
    # 尖頂朝北：最北的頂點和中心在同一條經線上
    cell = latlng_to_cell(25.0478, 121.517)
    c = cell_center(cell)
    top = max(cell_boundary(cell), key=lambda v: v[0])
    assert abs(top[1] - c[1]) < 1e-9


def test_neighbors_are_equidistant():
    cell = latlng_to_cell(25.0478, 121.517)
    c = cell_center(cell)
    d = [float(haversine_m(*c, *cell_center(n))) for n in grid_disk(cell, 1) if n != cell]
    assert len(d) == 6
    assert max(d) - min(d) < 1
    assert abs(d[0] - SIZE_M * math.sqrt(3)) < 1


def test_disk_size():
    assert len(grid_disk("0_0", 2)) == 19


def test_vectorized_matches_scalar():
    lats, lngs = [25.0478, 25.0331, 25.12], [121.517, 121.5638, 121.50]
    assert latlng_to_cells(lats, lngs) == [latlng_to_cell(a, b) for a, b in zip(lats, lngs)]
