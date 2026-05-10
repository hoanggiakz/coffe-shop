package com.coffeeshop.tableservice.controller;

import com.coffeeshop.tableservice.dto.BatchQrRequest;
import com.coffeeshop.tableservice.dto.CreateTableRequest;
import com.coffeeshop.tableservice.dto.UpdateStatusRequest;
import com.coffeeshop.tableservice.dto.UpdateTableRequest;
import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.coffeeshop.tableservice.service.TableService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TableControllerTest {

    @Mock
    private TableService tableService;

    @InjectMocks
    private TableController controller;

    private CoffeeTable sample;

    @BeforeEach
    void setUp() {
        sample = new CoffeeTable();
        sample.setId("t1");
        sample.setNumber(1);
        sample.setCapacity(4);
        sample.setStatus(CoffeeTable.TableStatus.AVAILABLE);
    }

    @Test
    void health_ShouldReturnOk() {
        ResponseEntity<Map<String, String>> response = controller.health();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("table-service", response.getBody().get("service"));
    }

    @Test
    void findAll_ShouldDelegate() {
        when(tableService.findAll("branch-1")).thenReturn(List.of(sample));
        ResponseEntity<List<CoffeeTable>> response = controller.findAll("branch-1");
        assertEquals(1, response.getBody().size());
        verify(tableService).findAll("branch-1");
    }

    @Test
    void findById_ShouldDelegate() {
        when(tableService.findById("t1")).thenReturn(sample);
        ResponseEntity<CoffeeTable> response = controller.findById("t1");
        assertEquals("t1", response.getBody().getId());
        verify(tableService).findById("t1");
    }

    @Test
    void create_ShouldReturnCreated() {
        CreateTableRequest request = new CreateTableRequest();
        request.setNumber(1);
        request.setCapacity(4);
        when(tableService.create(request)).thenReturn(sample);

        ResponseEntity<CoffeeTable> response = controller.create(request);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals(sample, response.getBody());
    }

    @Test
    void updateDeleteStatus_ShouldDelegate() {
        UpdateTableRequest updateTableRequest = new UpdateTableRequest();
        UpdateStatusRequest statusRequest = new UpdateStatusRequest();
        statusRequest.setStatus(CoffeeTable.TableStatus.RESERVED);
        Map<String, Object> deleteResult = Map.of("id", "t1", "deleted", true);
        CoffeeTable reserved = new CoffeeTable();
        reserved.setId("t1");
        reserved.setStatus(CoffeeTable.TableStatus.RESERVED);

        when(tableService.update("t1", updateTableRequest)).thenReturn(sample);
        when(tableService.delete("t1")).thenReturn(deleteResult);
        when(tableService.updateStatus("t1", CoffeeTable.TableStatus.RESERVED)).thenReturn(reserved);

        assertEquals(sample, controller.update("t1", updateTableRequest).getBody());
        assertEquals(deleteResult, controller.delete("t1").getBody());
        assertEquals(CoffeeTable.TableStatus.RESERVED, controller.updateStatus("t1", statusRequest).getBody().getStatus());
    }

    @Test
    void qrEndpoints_ShouldDelegate() {
        when(tableService.getQrCode("t1")).thenReturn("qr");
        when(tableService.getQrBatch(List.of("t1", "t2"))).thenReturn(List.of(Map.of("id", "t1", "qrCode", "qr")));
        when(tableService.callStaff("t1", null)).thenReturn(Map.of("message", "ok"));

        BatchQrRequest batch = new BatchQrRequest();
        batch.setTableIds(List.of("t1", "t2"));

        assertEquals("qr", controller.getQrCode("t1").getBody().get("qrCode"));
        assertEquals(1, controller.getQrCodesBatch(batch).getBody().size());
        assertEquals("ok", controller.callStaff("t1", null).getBody().get("message"));
    }
}
